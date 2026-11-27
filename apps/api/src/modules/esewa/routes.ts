import {
  type Database,
  findCredential,
  getPaymentByReference,
} from "@nepal-payment-lab/database";
import {
  esewaFormSchema,
  esewaRupeeNumber,
  esewaSignaturePayload,
  esewaStatusQuerySchema,
  parseEsewaAmount,
  providerStatuses,
} from "@nepal-payment-lab/shared";
import express from "express";
import { jsonErrorHandler } from "../../middleware/json-error-handler";
import { rateLimit } from "../../middleware/rate-limit";
import { issueCheckout } from "../checkout-issuance";
import {
  holdConnection,
  scenarioFromHeader,
  simulateInitiationFailure,
  validationError,
} from "../provider-http";
import { decideLookup } from "../simulation";
import { verifyEsewaSignature } from "./contract";

function notFoundStatus({
  productCode,
  transactionUuid,
  totalAmount,
}: {
  productCode: string;
  transactionUuid: string;
  totalAmount: number;
}) {
  return {
    product_code: productCode,
    transaction_uuid: transactionUuid,
    total_amount: totalAmount,
    status: "NOT_FOUND",
    ref_id: null,
  } as const;
}

export function createEsewaRouter({
  db,
  webOrigin,
}: {
  db: Database;
  webOrigin: string;
}) {
  const router = express.Router();

  router.use(
    rateLimit({
      limit: 120,
      key: (request) => request.ip ?? "unknown",
      provider: true,
    }),
  );

  router.post(
    "/api/epay/main/v2/form",
    express.urlencoded({ limit: "16kb", extended: false }),
    async (request, response) => {
      if (!request.is("application/x-www-form-urlencoded")) {
        response.status(415).json({ detail: "Unsupported media type." });
        return;
      }

      const input = esewaFormSchema.safeParse(request.body);

      if (!input.success) {
        response.status(400).json(validationError(input.error));
        return;
      }

      // eSewa signs raw strings; do not normalize amounts before verification.
      const rawTotal = input.data.total_amount;
      const rawUuid = input.data.transaction_uuid;
      const rawCode = input.data.product_code;

      const credential = await findCredential({
        db,
        prefix: rawCode,
        provider: "esewa",
      });
      const secret = credential?.key.secret ?? null;

      if (!credential || !secret) {
        response.status(400).json({
          product_code: [
            "Unknown product code. Use the lab product code from your eSewa dashboard.",
          ],
          error_key: "validation_error",
        });
        return;
      }

      const message = esewaSignaturePayload({
        signedFieldNames: input.data.signed_field_names,
        values: {
          total_amount: rawTotal,
          transaction_uuid: rawUuid,
          product_code: rawCode,
        },
      });
      const verified =
        message !== null &&
        verifyEsewaSignature({
          message,
          signature: input.data.signature,
          secret,
        });

      if (!verified) {
        response
          .status(400)
          .json({ code: "ES104", message: "Invalid payload signature." });
        return;
      }

      const scenario = scenarioFromHeader(request);

      if (!scenario) {
        response.status(400).json({
          detail: "Unknown Payment-Lab-Scenario.",
          error_key: "validation_error",
        });
        return;
      }

      if (
        simulateInitiationFailure({
          account: credential.account,
          request,
          response,
          failures: {
            "validation-error": {
              status: 400,
              body: {
                detail: "Simulated initiation failure: validation error.",
              },
            },
            "auth-error": {
              status: 401,
              body: {
                detail: "Simulated initiation failure: authentication error.",
              },
            },
            "server-error": {
              status: 500,
              body: { detail: "Internal server error." },
            },
          },
        })
      )
        return;

      const totalMinor = parseEsewaAmount(input.data.total_amount);
      if (totalMinor === null) {
        response.status(400).json({ detail: "Enter a valid total_amount." });
        return;
      }

      const checkout = await issueCheckout({
        provider: "esewa",
        db,
        webOrigin,
        accountId: credential.account.id,
        orderId: input.data.transaction_uuid,
        orderName: input.data.product_code,
        amountMinor: totalMinor,
        returnUrl: input.data.success_url,
        failureUrl: input.data.failure_url,
        scenario,
      });

      if (!checkout) {
        response.status(400).json({
          transaction_uuid: ["This transaction UUID was already used."],
          error_key: "validation_error",
        });
        return;
      }

      response.status(302).setHeader("Location", checkout.paymentUrl).end();
    },
  );

  router.get("/api/epay/transaction/status/", async (request, response) => {
    const input = esewaStatusQuerySchema.safeParse(request.query);

    if (!input.success) {
      response.status(400).json({
        detail: "Send product_code, total_amount, and transaction_uuid.",
      });
      return;
    }

    const requestedTotal = parseEsewaAmount(input.data.total_amount);

    if (requestedTotal === null) {
      response.status(400).json({ detail: "Enter a valid total_amount." });
      return;
    }
    const payment = await getPaymentByReference({
      db,
      provider: "esewa",
      orderName: input.data.product_code,
      orderId: input.data.transaction_uuid,
    });

    if (!payment || payment.amountMinor !== requestedTotal) {
      response.json(
        notFoundStatus({
          productCode: input.data.product_code,
          transactionUuid: input.data.transaction_uuid,
          totalAmount: esewaRupeeNumber(requestedTotal),
        }),
      );
      return;
    }

    const outcome = decideLookup({ payment, now: new Date() });
    if (outcome.kind === "timeout") {
      holdConnection({
        request,
        response,
        delayMs: outcome.delayMs,
      });
      return;
    }

    if (outcome.kind !== "payment") {
      if (outcome.kind === "server_error") {
        response.status(500).json({
          code: 0,
          error_message: "Service is currently unavailable",
        });
        return;
      }

      response.json(
        notFoundStatus({
          productCode: input.data.product_code,
          transactionUuid: input.data.transaction_uuid,
          totalAmount: esewaRupeeNumber(payment.amountMinor),
        }),
      );
      return;
    }

    const status = providerStatuses.esewa[outcome.status];
    response.json({
      product_code: input.data.product_code,
      transaction_uuid: input.data.transaction_uuid,
      total_amount: esewaRupeeNumber(outcome.amountMinor),
      status,
      ref_id:
        status === "COMPLETE" || status === "CANCELED"
          ? payment.transactionId
          : null,
    });
  });

  router.use((_request, response) =>
    response.status(404).json({ detail: "Not found." }),
  );

  router.use(
    jsonErrorHandler({
      logMessage: "Provider request failed",
      tooLarge: { detail: "Request body exceeds 16 KB." },
      internal: { detail: "Internal server error." },
    }),
  );

  return router;
}
