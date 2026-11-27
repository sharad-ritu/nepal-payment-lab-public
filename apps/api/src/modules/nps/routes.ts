import {
  type Database,
  findCredential,
  getAccountPayment,
  prepareNpsGateway,
} from "@nepal-payment-lab/database";
import {
  npsChargeSchema,
  npsDetailsSchema,
  npsGatewaySchema,
  npsInstrumentSchema,
  npsMerchantId,
  npsProcessSchema,
  npsStatusSchema,
  parseRupeeAmount,
} from "@nepal-payment-lab/shared";
import express, {
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import type { z } from "zod";
import { jsonErrorHandler } from "../../middleware/json-error-handler";
import { rateLimit } from "../../middleware/rate-limit";
import { matchesSecret } from "../../security/secrets";
import { issueCheckout, npsCheckoutToken } from "../checkout-issuance";
import {
  holdConnection,
  parseBasicAuth,
  scenarioFromHeader,
  simulateInitiationFailure,
} from "../provider-http";
import { decideLookup } from "../simulation";
import {
  npsError,
  npsInstrumentCode,
  npsInstruments,
  npsServiceCharge,
  npsSuccess,
  npsTransactionData,
  verifyNpsSignature,
} from "./contract";

type Credential = NonNullable<Awaited<ReturnType<typeof findCredential>>>;
const paths = [
  "/GetPaymentInstrumentDetails",
  "/GetServiceCharge",
  "/GetProcessId",
  "/CheckTransactionStatus",
];

export function createNpsRouter({
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
      errorBody: npsError("Request was throttled."),
    }),
  );

  function signed<T extends Record<string, string>>(
    schema: z.ZodType<T>,
    handle: (
      input: T,
      credential: Credential,
      response: Response,
      request: Request,
    ) => Promise<void> | void,
  ): RequestHandler {
    return async (request, response) => {
      const authentication = parseBasicAuth(request.get("Authorization"));
      const credential = authentication
        ? await findCredential({
            db,
            prefix: authentication.username,
            provider: "nps",
          })
        : null;
      if (
        !authentication ||
        !credential?.key.secret ||
        !matchesSecret({
          secret: authentication.password,
          digest: credential.key.digest,
        })
      ) {
        response.status(401).json(npsError("Invalid credentials."));
        return;
      }
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json(npsError("Invalid request."));
        return;
      }
      if (
        parsed.data.MerchantId !== npsMerchantId(credential.key.prefix) ||
        parsed.data.MerchantName !== credential.key.prefix
      ) {
        response.status(400).json(npsError("Invalid merchant details."));
        return;
      }
      if (
        !verifyNpsSignature({
          values: parsed.data,
          secret: credential.key.secret,
        })
      ) {
        response.status(400).json(npsError("Invalid signature."));
        return;
      }
      await handle(parsed.data, credential, response, request);
    };
  }
  const json = [
    ((request, response, next) => {
      if (!request.is("application/json")) {
        response.status(415).json(npsError("Unsupported media type."));
        return;
      }
      next();
    }) satisfies RequestHandler,
    express.json({ limit: "16kb" }),
  ];

  router.post(
    "/GetPaymentInstrumentDetails",
    ...json,
    signed(npsInstrumentSchema, (_input, _credential, response) => {
      response.json(npsSuccess(npsInstruments));
    }),
  );
  router.post(
    "/GetServiceCharge",
    ...json,
    signed(npsChargeSchema, (input, _credential, response) => {
      if (input.InstrumentCode !== npsInstrumentCode) {
        response.json(npsError("Unknown instrument."));
        return;
      }
      response.json(
        npsSuccess({
          Amount: input.Amount,
          CommissionType: "f",
          ChargeValue: String(npsServiceCharge),
          TotalChargeAmount: npsServiceCharge,
        }),
      );
    }),
  );
  router.post(
    "/GetProcessId",
    ...json,
    signed(npsProcessSchema, async (input, credential, response, request) => {
      const scenario = scenarioFromHeader(request);
      if (!scenario) {
        response.status(400).json(npsError("Unknown Payment-Lab-Scenario."));
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
              body: npsError("Simulated validation error."),
            },
            "auth-error": {
              status: 401,
              body: npsError("Invalid credentials."),
            },
            "server-error": {
              status: 500,
              body: npsError("Internal server error."),
            },
          },
        })
      )
        return;
      const account = credential.account;
      if (!account.responseUrl) {
        response.json(npsError("Configure Response URL in the NPX dashboard."));
        return;
      }
      const amountMinor = parseRupeeAmount(input.Amount);
      if (amountMinor === null) {
        response.status(400).json(npsError("Invalid amount."));
        return;
      }
      const checkout = await issueCheckout({
        db,
        webOrigin,
        provider: "nps",
        accountId: account.id,
        orderId: input.MerchantTxnId,
        orderName: input.MerchantName,
        amountMinor,
        returnUrl: account.responseUrl,
        scenario,
        details: {
          merchantId: input.MerchantId,
          gatewayReady: false,
          instrumentCode: npsInstrumentCode,
          remarks: "",
        },
      });
      response.json(
        checkout
          ? npsSuccess(
              { ProcessId: checkout.paymentId },
              "Process Id generated successfully",
            )
          : npsError("Duplicate Record"),
      );
    }),
  );
  router.post(
    "/CheckTransactionStatus",
    ...json,
    signed(npsStatusSchema, async (input, credential, response, request) => {
      const payment = await getAccountPayment({
        db,
        accountId: credential.account.id,
        orderId: input.MerchantTxnId,
      });
      if (
        !payment ||
        !npsDetailsSchema.parse(payment.providerDetails).gatewayReady
      ) {
        response.json(npsError("Transaction not initialized yet", "3"));
        return;
      }
      const decision = decideLookup({ payment, now: new Date() });
      if (decision.kind === "timeout") {
        holdConnection({
          request,
          response,
          delayMs: decision.delayMs,
        });
        return;
      }
      if (decision.kind === "not_found") {
        response.json(npsError("Transaction not initialized yet", "3"));
        return;
      }
      if (decision.kind === "server_error") {
        response.status(500).json(npsError("Internal server error."));
        return;
      }
      response.json(
        npsSuccess(
          npsTransactionData({
            payment,
            status: decision.status,
            amountMinor: decision.amountMinor,
          }),
        ),
      );
    }),
  );

  router.post(
    "/Payment/Index",
    express.raw({ type: "multipart/form-data", limit: "16kb" }),
    express.urlencoded({ extended: false, limit: "16kb" }),
    async (request, response) => {
      let body: unknown = request.body;
      if (request.is("multipart/form-data")) {
        if (!Buffer.isBuffer(body)) {
          response.status(400).json(npsError("Invalid gateway form."));
          return;
        }
        try {
          const form = await new Request("http://nps.invalid", {
            method: "POST",
            headers: { "Content-Type": request.get("Content-Type") ?? "" },
            body: new Uint8Array(body),
          }).formData();
          const values: Record<string, string> = {};
          for (const [key, value] of form) {
            if (typeof value !== "string" || key in values) {
              response.status(400).json(npsError("Invalid gateway form."));
              return;
            }
            values[key] = value;
          }
          body = values;
        } catch {
          response.status(400).json(npsError("Invalid gateway form."));
          return;
        }
      } else if (!request.is("application/x-www-form-urlencoded")) {
        response.status(415).json(npsError("Unsupported media type."));
        return;
      }
      const parsed = npsGatewaySchema.safeParse(body);
      if (!parsed.success) {
        response.status(400).json(npsError("Invalid gateway form."));
        return;
      }
      const input = parsed.data;
      const instrument = input.InstrumentCode || npsInstrumentCode;
      if (instrument !== npsInstrumentCode) {
        response.status(400).json(npsError("Unknown instrument."));
        return;
      }
      const result = await prepareNpsGateway({
        db,
        processId: input.ProcessId,
        decide: (payment) => {
          const details = npsDetailsSchema.parse(payment.providerDetails);
          if (
            details.merchantId !== input.MerchantId ||
            payment.orderName !== input.MerchantName ||
            payment.orderId !== input.MerchantTxnId ||
            payment.amountMinor !== parseRupeeAmount(input.Amount)
          ) {
            return { changes: null, result: "mismatch" };
          }
          if (payment.simulatedAt || new Date() >= payment.expiresAt)
            return { changes: null, result: "unavailable" };
          const returnUrl = input.ResponseUrl ?? payment.returnUrl;
          const remarks = input.TransactionRemarks ?? "";
          if (details.gatewayReady)
            return {
              changes: null,
              result:
                returnUrl === payment.returnUrl &&
                remarks === details.remarks &&
                instrument === details.instrumentCode
                  ? "ready"
                  : "mismatch",
            };
          return {
            changes: {
              returnUrl,
              providerDetails: {
                ...details,
                gatewayReady: true,
                instrumentCode: instrument,
                remarks,
              },
            },
            result: "ready",
          };
        },
      });
      if (result !== "ready") {
        response
          .status(result === "unavailable" ? 409 : 400)
          .json(
            npsError(
              result === "unavailable"
                ? "Checkout unavailable."
                : "Invalid process or gateway details.",
            ),
          );
        return;
      }
      response
        .status(303)
        .setHeader(
          "Location",
          new URL(`/checkout/${npsCheckoutToken(input.ProcessId)}`, webOrigin)
            .href,
        )
        .end();
    },
  );
  router.all([...paths, "/Payment/Index"], (_request, response) =>
    response
      .status(405)
      .setHeader("Allow", "POST")
      .json(npsError("Method not allowed.")),
  );
  router.use((_request, response) =>
    response.status(404).json(npsError("Not found.")),
  );
  router.use(
    jsonErrorHandler({
      logMessage: "NPX request failed",
      invalidJson: npsError("JSON parse error."),
      tooLarge: npsError("Request body exceeds 16 KB."),
      internal: npsError("Internal server error."),
    }),
  );
  return router;
}
