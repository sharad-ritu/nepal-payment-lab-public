import {
  type Database,
  findCredential,
  getAccountPayment,
} from "@nepal-payment-lab/database";
import {
  connectipsFormSchema,
  connectipsMerchantId,
  connectipsProviderDetailsSchema,
  connectipsValidateSchema,
} from "@nepal-payment-lab/shared";
import express from "express";
import { jsonErrorHandler } from "../../middleware/json-error-handler";
import { rateLimit } from "../../middleware/rate-limit";
import { matchesSecret } from "../../security/secrets";
import { issueCheckout } from "../checkout-issuance";
import {
  holdConnection,
  parseBasicAuth,
  scenarioFromHeader,
  simulateInitiationFailure,
  validationError,
} from "../provider-http";
import { decideLookup } from "../simulation";
import { connectipsTxnFacts, connectipsValidationStatus } from "./contract";

// The live web service rejects Basic auth with a plain-text body and no
// content type, so merchants must not assume every response is JSON.
function unauthorized(response: express.Response) {
  response.status(401).end("HTTP Status 401 : Bad credentials\n");
}

export function createConnectipsRouter({
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
    "/connectipswebgw/loginpage",
    express.urlencoded({ limit: "16kb", extended: false }),
    async (request, response) => {
      if (!request.is("application/x-www-form-urlencoded")) {
        response.status(415).json({ detail: "Unsupported media type." });
        return;
      }

      const input = connectipsFormSchema.safeParse(request.body);

      if (!input.success) {
        response.status(400).json(validationError(input.error));
        return;
      }

      const credential = await findCredential({
        db,
        prefix: input.data.APPID,
        provider: "connectips",
      });

      if (!credential?.key.secret) {
        response.status(400).json({
          APPID: [
            "Unknown app ID. Use the lab app ID from your connectIPS dashboard.",
          ],
          error_key: "validation_error",
        });
        return;
      }

      if (
        input.data.MERCHANTID !== connectipsMerchantId(credential.key.prefix)
      ) {
        response.status(400).json({
          MERCHANTID: ["Merchant ID does not match this app ID."],
          error_key: "validation_error",
        });
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

      // The live gateway redirects to URLs registered with NCHL, not form fields.
      const { successUrl, failureUrl } = credential.account;
      if (!successUrl || !failureUrl) {
        response.status(400).json({
          detail:
            "Register a Success URL and Failure URL in the connectIPS dashboard before posting the gateway form.",
          error_key: "validation_error",
        });
        return;
      }

      const checkout = await issueCheckout({
        provider: "connectips",
        db,
        webOrigin,
        accountId: credential.account.id,
        orderId: input.data.TXNID,
        orderName: input.data.APPNAME,
        amountMinor: Number(input.data.TXNAMT),
        returnUrl: successUrl,
        failureUrl,
        details: {
          appName: input.data.APPNAME,
          referenceId: input.data.REFERENCEID,
          remarks: input.data.REMARKS,
          particulars: input.data.PARTICULARS,
        },
        scenario,
      });

      if (!checkout) {
        response.status(403).json({
          detail: "Duplicate TXNID. Each transaction ID can be used once.",
        });
        return;
      }

      response.status(303).setHeader("Location", checkout.paymentUrl).end();
    },
  );

  async function basicAuth(
    request: express.Request,
    response: express.Response,
  ): Promise<boolean> {
    const authentication = parseBasicAuth(request.get("authorization"));
    const credential = authentication
      ? await findCredential({
          db,
          prefix: authentication.username,
          provider: "connectips",
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
      unauthorized(response);
      return false;
    }

    request.labAccount = credential.account;
    request.labPrefix = credential.key.prefix;
    return true;
  }

  const webws = express.Router();

  webws.use((request, response, next) => {
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      response.status(405).json({ detail: "Method not allowed." });
      return;
    }

    if (!request.is("application/json")) {
      response.status(415).json({ detail: "Unsupported media type." });
      return;
    }

    next();
  });

  webws.use(express.json({ limit: "16kb" }));

  webws.use(async (request, response, next) => {
    if (await basicAuth(request, response)) next();
  });

  function verifyPayment(
    kind: "validation" | "details",
  ): express.RequestHandler {
    return async (request, response) => {
      const account = request.labAccount;
      const prefix = request.labPrefix;

      if (!account || !prefix)
        throw new Error("Missing provider authentication.");

      const input = connectipsValidateSchema.safeParse(request.body);
      if (!input.success) {
        response.status(400).json({
          status: "ERROR",
          statusDesc: "Invalid request.",
        });
        return;
      }

      const data = input.data;
      const reference = {
        merchantId: Number(data.merchantId),
        appId: data.appId,
        referenceId: data.referenceId,
        token: null,
      };
      const matchesAccount =
        data.merchantId === connectipsMerchantId(prefix) &&
        data.appId === prefix;
      const payment = matchesAccount
        ? await getAccountPayment({
            db,
            accountId: account.id,
            orderId: data.referenceId,
          })
        : null;

      function notFound() {
        const failure = {
          status: "ERROR",
          statusDesc: "TRANSACTION NOT FOUND",
        };
        // The UAT detail service returns every receipt field, echoing the
        // requested reference in refId while referenceId stays null.
        response.json(
          kind === "details"
            ? {
                ...failure,
                merchantId: reference.merchantId,
                appId: reference.appId,
                referenceId: null,
                txnAmt: null,
                token: null,
                debitBankCode: null,
                txnId: null,
                batchId: null,
                txnDate: null,
                txnCrncy: null,
                chargeAmt: null,
                chargeLiability: null,
                refId: data.referenceId,
                remarks: null,
                particulars: null,
                creditStatus: null,
              }
            : {
                ...reference,
                txnAmt: data.txnAmt,
                ...failure,
              },
        );
      }

      if (!payment || payment.amountMinor !== Number(data.txnAmt)) {
        notFound();
        return;
      }

      const outcome = decideLookup({
        payment,
        now: new Date(),
      });
      if (outcome.kind === "timeout") {
        holdConnection({
          request,
          response,
          delayMs: outcome.delayMs,
        });
        return;
      }
      if (outcome.kind === "server_error") {
        response.status(500).json({
          status: "ERROR",
          statusDesc: "Internal server error.",
        });
        return;
      }
      if (outcome.kind === "not_found") {
        notFound();
        return;
      }

      const result = connectipsValidationStatus(outcome.status);
      if (kind === "validation") {
        response.json({
          ...reference,
          txnAmt: String(outcome.amountMinor),
          ...result,
        });
        return;
      }

      const details = connectipsProviderDetailsSchema.parse(
        payment.providerDetails,
      );
      const facts = connectipsTxnFacts(payment);
      response.json({
        ...result,
        ...reference,
        txnAmt: outcome.amountMinor,
        ...facts,
        refId: details.referenceId,
        remarks: details.remarks,
        particulars: details.particulars,
        // NCHL classifies 999 as success. FAILED is the lab's non-success code;
        // the top-level status still distinguishes failed and incomplete payments.
        creditStatus: result.status === "SUCCESS" ? "000" : "FAILED",
      });
    };
  }

  webws.post("/api/creditor/validatetxn", verifyPayment("validation"));
  webws.post("/api/creditor/gettxndetail", verifyPayment("details"));

  router.use("/connectipswebws", webws);

  router.use((_request, response) =>
    response.status(404).json({ detail: "Not found." }),
  );

  router.use(
    jsonErrorHandler({
      logMessage: "Provider request failed",
      invalidJson: {
        status: "ERROR",
        statusDesc: "Invalid request.",
      },
      tooLarge: { detail: "Request body exceeds 16 KB." },
      internal: { detail: "Internal server error." },
    }),
  );

  return router;
}
