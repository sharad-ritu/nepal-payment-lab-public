import type { Database } from "@nepal-payment-lab/database";
import type { HealthResponse } from "@nepal-payment-lab/shared";
import express from "express";
import { jsonErrorHandler } from "./middleware/json-error-handler";
import { rateLimit } from "./middleware/rate-limit";
import { createCheckoutRouter } from "./modules/checkout";
import { createConnectipsRouter } from "./modules/connectips/routes";
import { createEsewaRouter } from "./modules/esewa/routes";
import { createKhaltiRouter } from "./modules/khalti/routes";
import { createLabRouter } from "./modules/lab/routes";
import { createNpsRouter } from "./modules/nps/routes";

export function createApp({
  db,
  webOrigin,
}: {
  db: Database;
  webOrigin: string;
}) {
  const app = express();

  app.disable("x-powered-by");

  app.use((_request, response, next) => {
    response.setHeader("X-Request-Id", crypto.randomUUID());
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  app.get("/health", (_request, response) => {
    response.json({
      kind: "healthy",
      service: "nepal-payment-lab-api",
    } satisfies HealthResponse);
  });

  app.use(
    "/khalti/api/v2",
    createKhaltiRouter({
      db,
      webOrigin,
    }),
  );

  app.use(
    "/esewa",
    createEsewaRouter({
      db,
      webOrigin,
    }),
  );

  app.use(
    "/connectips",
    createConnectipsRouter({
      db,
      webOrigin,
    }),
  );
  app.use(
    "/nps",
    createNpsRouter({
      db,
      webOrigin,
    }),
  );

  app.use("/v1/checkout", createCheckoutRouter({ db }));

  app.use(
    "/v1",
    rateLimit({
      limit: 180,
      key: () => "dashboard",
    }),
    express.json({ limit: "16kb" }),
    createLabRouter({ db }),
  );

  app.use((_request, response) => {
    response
      .status(404)
      .json({ kind: "not_found", message: "Route not found." });
  });

  app.use(
    jsonErrorHandler({
      logMessage: "Request failed",
      invalidJson: {
        kind: "invalid_json",
        message: "Send valid JSON.",
      },
      tooLarge: {
        kind: "payload_too_large",
        message: "Request body is too large.",
      },
      internal: {
        kind: "internal_error",
        message: "Could not complete the request. Try again.",
      },
    }),
  );

  return app;
}
