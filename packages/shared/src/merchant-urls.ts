import { z } from "zod";

export function createMerchantUrlSchema(error: string) {
  return z
    .url({
      protocol: /^https?$/,
      error,
      abort: true,
    })
    .refine((value) => {
      const url = new URL(value);

      return !url.username && !url.password;
    }, error);
}

export const merchantUrlSchema = createMerchantUrlSchema(
  "Use an HTTP or HTTPS URL without embedded credentials.",
);

export const registeredUrlKeyOptions = [
  "successUrl",
  "failureUrl",
  "responseUrl",
] as const;
export type RegisteredUrlKey = (typeof registeredUrlKeyOptions)[number];
