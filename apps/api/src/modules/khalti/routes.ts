import {
  type Database,
  findCredential,
  getPayment,
} from "@nepal-payment-lab/database";
import express from "express";
import { jsonErrorHandler } from "../../middleware/json-error-handler";
import { rateLimit } from "../../middleware/rate-limit";
import { matchesSecret } from "../../security/secrets";
import { issueCheckout } from "../checkout-issuance";
import {
  holdConnection,
  scenarioFromHeader,
  simulateInitiationFailure,
  validationError,
} from "../provider-http";
import { decideLookup } from "../simulation";
import {
  initiationSchema,
  khaltiLookupResponse,
  khaltiTimestamp,
  lookupSchema,
} from "./contract";

export function createKhaltiRouter({
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

  router.use(async (request, response, next) => {
    const match = /^Key (lab_test_[a-f0-9]{24}\.[A-Za-z0-9_-]{43})$/i.exec(
      request.get("authorization") ?? "",
    );

    const secret = match?.[1];
    if (!secret) {
      response.status(401).json({
        detail: request.get("authorization")?.toLowerCase().startsWith("key ")
          ? "Invalid token."
          : "Authentication credentials were not provided.",
        status_code: 401,
      });
      return;
    }

    const prefix = secret.split(".")[0] ?? "";
    const credential = await findCredential({ db, prefix, provider: "khalti" });
    if (
      !credential ||
      !matchesSecret({ secret, digest: credential.key.digest })
    ) {
      response.status(401).json({ detail: "Invalid token.", status_code: 401 });
      return;
    }

    request.labAccount = credential.account;
    next();
  });

  router.use(
    rateLimit({
      limit: 60,
      key: (request) => request.labAccount?.id ?? "unknown",
      provider: true,
    }),
  );

  router.use((request, response, next) => {
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      response
        .status(405)
        .json({ detail: `Method "${request.method}" not allowed.` });
      return;
    }

    if (!request.is("application/json")) {
      response.status(415).json({ detail: "Unsupported media type." });
      return;
    }

    next();
  });

  router.use(express.json({ limit: "16kb" }));

  router.post("/epayment/initiate/", async (request, response) => {
    const account = request.labAccount;

    if (!account) throw new Error("Missing provider authentication.");

    const input = initiationSchema.safeParse(request.body);

    if (!input.success) {
      response.status(400).json(validationError(input.error));
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
        account,
        request,
        response,
        failures: {
          "validation-error": {
            status: 400,
            body: {
              amount: ["A valid integer is required."],
              error_key: "validation_error",
            },
          },
          "auth-error": {
            status: 401,
            body: {
              detail: "Invalid token.",
              status_code: 401,
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

    const checkout = await issueCheckout({
      provider: "khalti",
      db,
      webOrigin,
      accountId: account.id,
      orderId: input.data.purchase_order_id,
      orderName: input.data.purchase_order_name,
      amountMinor: input.data.amount,
      returnUrl: input.data.return_url,
      scenario,
      details: { merchantMetadata: input.data.merchantMetadata },
    });
    if (!checkout) throw new Error("Khalti checkout was not created.");

    response.json({
      pidx: checkout.paymentId,
      payment_url: checkout.paymentUrl,
      expires_at: khaltiTimestamp(checkout.expiresAt),
      expires_in: checkout.expiresIn,
    });
  });

  router.post("/epayment/lookup/", async (request, response) => {
    const account = request.labAccount;

    if (!account) throw new Error("Missing provider authentication.");

    const input = lookupSchema.safeParse(request.body);

    if (!input.success) {
      response.status(400).json(validationError(input.error));
      return;
    }

    const payment = await getPayment({
      db,
      accountId: account.id,
      pidx: input.data.pidx,
    });

    if (!payment) {
      response
        .status(404)
        .json({ detail: "Not found.", error_key: "validation_error" });
      return;
    }

    const outcome = decideLookup({ payment, now: new Date() });
    if (outcome.kind !== "timeout") {
      const result = khaltiLookupResponse({
        payment,
        outcome,
      });
      response.status(result.status).json(result.body);
      return;
    }

    holdConnection({
      request,
      response,
      delayMs: outcome.delayMs,
    });
  });

  router.use((_request, response) =>
    response.status(404).json({ detail: "Not found." }),
  );

  router.use(
    jsonErrorHandler({
      logMessage: "Provider request failed",
      invalidJson: {
        detail: "JSON parse error.",
        error_key: "validation_error",
      },
      tooLarge: { detail: "Request body exceeds 16 KB." },
      internal: { detail: "Internal server error." },
    }),
  );

  return router;
}
