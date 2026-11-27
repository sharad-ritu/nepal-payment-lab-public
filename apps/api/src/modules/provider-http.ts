import type { ProviderAccountRecord } from "@nepal-payment-lab/database";
import {
  type InitiationMode,
  initiationModeSchema,
  type ScenarioSnapshot,
  scenarioKeySchema,
  scenarios,
} from "@nepal-payment-lab/shared";
import type { Request, Response } from "express";
import type { z } from "zod";

declare global {
  namespace Express {
    interface Request {
      labAccount?: ProviderAccountRecord;
      labPrefix?: string;
    }
  }
}

export function holdConnection({
  request,
  response,
  delayMs,
}: {
  request: Request;
  response: Response;
  delayMs: number;
}) {
  const timer = setTimeout(() => request.socket.destroy(), delayMs);
  timer.unref();
  response.once("close", () => clearTimeout(timer));
}

export function scenarioFromHeader(request: Request): ScenarioSnapshot | null {
  const selection = scenarioKeySchema.safeParse(
    request.get("Payment-Lab-Scenario") ?? "normal-completion",
  );

  return selection.success ? scenarios[selection.data].snapshot : null;
}

type FailureMode = Exclude<InitiationMode, "allow" | "timeout">;

export function simulateInitiationFailure({
  account,
  request,
  response,
  failures,
}: {
  account: ProviderAccountRecord;
  request: Request;
  response: Response;
  failures: Record<FailureMode, { status: number; body: unknown }>;
}) {
  const mode = initiationModeSchema.parse(account.initiationMode);
  if (mode === "allow") return false;

  if (mode === "timeout") {
    holdConnection({
      request,
      response,
      delayMs: 60000,
    });
    return true;
  }

  const failure = failures[mode];
  response.status(failure.status).json(failure.body);
  return true;
}

export function parseBasicAuth(header: string | undefined) {
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header ?? "");
  if (!match?.[1]) return null;

  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator <= 0) return null;

  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

export function validationError(error: z.ZodError) {
  const fields: Record<string, string[] | string> = {
    error_key: "validation_error",
  };
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "non_field_errors");
    const existing = fields[key];
    fields[key] = [...(Array.isArray(existing) ? existing : []), issue.message];
  }

  return fields;
}
