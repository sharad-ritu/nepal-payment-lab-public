import { z } from "zod";
import { merchantUrlSchema, type RegisteredUrlKey } from "./merchant-urls";

export const providerSchema = z.enum(["khalti", "esewa", "connectips", "nps"]);
export type Provider = z.infer<typeof providerSchema>;

export const initiationModeSchema = z.enum([
  "allow",
  "validation-error",
  "auth-error",
  "server-error",
  "timeout",
]);
export type InitiationMode = z.infer<typeof initiationModeSchema>;

export const initiationModes = {
  allow: {
    name: "Allow initiation",
    description: "Accept new payments. Choose the payment outcome on checkout.",
  },
  "validation-error": {
    name: "Validation error (400)",
    description: "Reject new payments with a simulated validation error.",
  },
  "auth-error": {
    name: "Authentication error (401)",
    description:
      "Reject new payments as unauthenticated, even with a valid lab key.",
  },
  "server-error": {
    name: "Server error (500)",
    description: "Simulate an unavailable provider.",
  },
  timeout: {
    name: "Connection timeout",
    description:
      "Wait 60 seconds, then close the connection without a response.",
  },
} satisfies Record<InitiationMode, { name: string; description: string }>;

// URLs a merchant registers with the provider team instead of sending per
// payment. New payments capture the values saved when they are created.
export const registeredUrlKeys = {
  khalti: [],
  esewa: [],
  connectips: ["successUrl", "failureUrl"],
  nps: ["responseUrl"],
} as const satisfies Record<Provider, readonly RegisteredUrlKey[]>;

export function providerRegisteredUrlKeys(
  provider: Provider,
): readonly RegisteredUrlKey[] {
  return registeredUrlKeys[provider];
}

const registeredUrl = merchantUrlSchema.nullable().optional();

export const providerSettingsSchema = z
  .object({
    initiationMode: initiationModeSchema.optional(),
    successUrl: registeredUrl,
    failureUrl: registeredUrl,
    responseUrl: registeredUrl,
  })
  .strict()
  .refine(
    (settings) => Object.values(settings).some((value) => value !== undefined),
    "Send at least one setting to update.",
  );
export type ProviderSettings = z.infer<typeof providerSettingsSchema>;

const providerAccountSchema = z.object({
  id: z.uuid(),
  provider: providerSchema,
  initiationMode: initiationModeSchema,
  createdAt: z.iso.datetime(),
  successUrl: z.string().nullable().optional(),
  failureUrl: z.string().nullable().optional(),
  responseUrl: z.string().nullable().optional(),
});
export type ProviderAccount = z.infer<typeof providerAccountSchema>;

const keySchema = z.object({
  id: z.uuid(),
  prefix: z.string(),
  secret: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const providerResponseSchema = z.object({
  account: providerAccountSchema.nullable(),
  key: keySchema.nullable(),
});
export type ProviderResponse = z.infer<typeof providerResponseSchema>;

export const credentialResponseSchema = z.object({
  account: providerAccountSchema,
  secret: z.string(),
  key: keySchema,
});
