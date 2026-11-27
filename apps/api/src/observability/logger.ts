import pino from "pino";
import { z } from "zod";

export const logger = pino({
  level: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info")
    .parse(process.env.LOG_LEVEL),
  redact: ["req.headers.authorization", "req.headers.cookie"],
});
