import {
  completeCheckout,
  type Database,
  getCheckout,
} from "@nepal-payment-lab/database";
import {
  checkoutSelectionSchema,
  checkoutTokenSchema,
  npsDetailsSchema,
  scenarios,
} from "@nepal-payment-lab/shared";
import { json, type Request, Router } from "express";
import { rateLimit } from "../middleware/rate-limit";
import { digestSecret } from "../security/secrets";
import { connectipsMerchantReturn } from "./connectips/contract";
import { esewaMerchantReturn } from "./esewa/contract";
import { merchantReturn } from "./khalti/contract";
import { npsReturnUrl } from "./nps/contract";

declare global {
  namespace Express {
    interface Request {
      labCheckout?: NonNullable<Awaited<ReturnType<typeof getCheckout>>>;
    }
  }
}

function requireCheckout(request: Request) {
  const checkout = request.labCheckout;
  if (!checkout) throw new Error("Missing checkout capability.");

  return checkout;
}

export function createCheckoutRouter({ db }: { db: Database }) {
  const router = Router();
  // Web forwarding shares an API peer address. Limit each verified payment
  // instead, and allocate no buckets for nonexistent checkout tokens.
  const checkoutLimit = rateLimit({
    limit: 60,
    key: (request) => requireCheckout(request).payment.id,
  });

  router.use(json({ limit: "1kb" }));

  router.param("token", async (request, response, next, value: string) => {
    if (!checkoutTokenSchema.safeParse(value).success) {
      response
        .status(404)
        .json({ kind: "not_found", message: "Checkout not found." });
      return;
    }

    const row = await getCheckout({
      db,
      digest: digestSecret(value),
    });

    if (!row) {
      response
        .status(404)
        .json({ kind: "not_found", message: "Checkout not found." });
      return;
    }

    request.labCheckout = row;
    checkoutLimit(request, response, next);
  });

  router.get("/:token", (request, response) => {
    const row = requireCheckout(request);

    if (
      row.account.provider === "nps" &&
      !npsDetailsSchema.parse(row.payment.providerDetails).gatewayReady
    ) {
      response
        .status(404)
        .json({ kind: "not_found", message: "Checkout not found." });
      return;
    }

    response.json({
      provider: row.account.provider,
      orderId: row.payment.orderId,
      orderName: row.payment.orderName,
      amountMinor: row.payment.amountMinor,
      scenarioKey: row.payment.scenarioKey,
      expiresAt: row.payment.expiresAt.toISOString(),
      used: Boolean(row.payment.simulatedAt),
      returnHost: new URL(row.payment.returnUrl).host,
      failureHost: row.payment.failureUrl
        ? new URL(row.payment.failureUrl).host
        : null,
    });
  });

  router.post("/:token/simulate", async (request, response) => {
    const input = checkoutSelectionSchema.safeParse(request.body);

    if (!input.success) {
      response.status(400).json({
        kind: "invalid_request",
        message: "Choose a payment outcome.",
      });
      return;
    }

    const outcome = await completeCheckout<
      { kind: "error"; message: string } | { kind: "redirect"; url: string }
    >({
      db,
      digest: digestSecret(String(request.params.token)),
      decide: (payment, account, secret) => {
        const now = new Date();
        const nps =
          account.provider === "nps"
            ? npsDetailsSchema.parse(payment.providerDetails)
            : null;
        const error = payment.simulatedAt
          ? "This checkout has already been used."
          : now >= payment.expiresAt
            ? "This checkout has expired. Initiate another payment."
            : account.provider === "esewa" && !secret
              ? "The lab key was revoked. Generate a key and initiate another payment."
              : null;

        if (nps && !nps.gatewayReady)
          return {
            changes: null,
            result: {
              kind: "error",
              message: "Submit the NPX gateway form first.",
            },
          };
        if (error)
          return { changes: null, result: { kind: "error", message: error } };

        const scenario = scenarios[input.data.scenarioKey].snapshot;
        const changes = {
          simulatedAt: now,
          scenarioKey: scenario.key,
          scenarioSnapshot: scenario,
        };
        if (nps) {
          return {
            changes,
            result: {
              kind: "redirect",
              url: npsReturnUrl(payment),
            },
          };
        }
        const redirect =
          account.provider === "esewa" && secret
            ? esewaMerchantReturn({
                payment: { ...payment, ...changes },
                secret,
              })
            : account.provider === "connectips"
              ? connectipsMerchantReturn({
                  payment: { ...payment, ...changes },
                })
              : merchantReturn({ ...payment, ...changes });

        return { changes, result: { kind: "redirect", url: redirect.url } };
      },
    });

    if (!outcome) {
      response
        .status(404)
        .json({ kind: "not_found", message: "Checkout not found." });
      return;
    }

    if (outcome.result.kind === "error") {
      response.status(409).json({
        kind: "checkout_unavailable",
        message: outcome.result.message,
      });
      return;
    }

    response.status(303).setHeader("Location", outcome.result.url).end();
  });

  return router;
}
