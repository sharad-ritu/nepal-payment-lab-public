import type { ErrorRequestHandler } from "express";
import { logger } from "../observability/logger";

// Each surface keeps its own error vocabulary. Log identifiers, never raw
// errors: database errors can contain SQL parameters and payment data.
export function jsonErrorHandler({
  logMessage,
  invalidJson,
  tooLarge,
  internal,
}: {
  logMessage: string;
  invalidJson?: unknown;
  tooLarge: unknown;
  internal: unknown;
}): ErrorRequestHandler {
  return (error: unknown, _request, response, _next) => {
    if (
      invalidJson !== undefined &&
      error instanceof SyntaxError &&
      "body" in error
    ) {
      response.status(400).json(invalidJson);
      return;
    }

    if (
      error instanceof Error &&
      "type" in error &&
      error.type === "entity.too.large"
    ) {
      response.status(413).json(tooLarge);
      return;
    }

    logger.error(
      {
        requestId: response.getHeader("X-Request-Id"),
        errorType: error instanceof Error ? error.name : "UnknownError",
      },
      logMessage,
    );
    response.status(500).json(internal);
  };
}
