import { z } from "zod";
import { parseRupeeAmount } from "./amounts";
import { merchantUrlSchema } from "./merchant-urls";

export { labMerchantId as npsMerchantId } from "./credentials";

// OnePG excludes Signature itself and signs the raw string values in key order.
export function npsSignaturePayload(values: Record<string, string>): string {
  return Object.keys(values)
    .filter((key) => key !== "Signature")
    .sort()
    .map((key) => values[key])
    .join("");
}
const identity = {
  MerchantId: z.string().regex(/^\d{1,20}$/),
  MerchantName: z.string().min(1).max(100),
};
const amount = z.string().refine((value) => {
  const minor = parseRupeeAmount(value);
  return minor !== null && minor > 0;
}, "Enter a positive decimal rupee amount.");
const transactionId = z.string().min(1).max(200);
const signature = z
  .string()
  .regex(
    /^[a-f0-9]{128}$/,
    "Send a lowercase hexadecimal HMAC-SHA512 signature.",
  );
export const npsInstrumentSchema = z
  .object({ ...identity, Signature: signature })
  .strict();
export const npsChargeSchema = npsInstrumentSchema.extend({
  Amount: amount,
  InstrumentCode: z.string().min(1).max(50),
});
export const npsProcessSchema = npsInstrumentSchema.extend({
  Amount: amount,
  MerchantTxnId: transactionId,
});
export const npsStatusSchema = npsInstrumentSchema.extend({
  MerchantTxnId: transactionId,
});
export const npsGatewaySchema = z
  .object({
    ...identity,
    Amount: amount,
    MerchantTxnId: transactionId,
    ProcessId: z
      .string()
      .regex(/^[A-F0-9]{8}(?:_[A-F0-9]{4}){3}_[A-F0-9]{12}$/),
    TransactionRemarks: z.string().max(500).optional(),
    InstrumentCode: z.string().max(50).optional(),
    ResponseUrl: merchantUrlSchema.optional(),
  })
  .strict();
export const npsDetailsSchema = z.object({
  merchantId: z.string(),
  gatewayReady: z.boolean(),
  instrumentCode: z.string(),
  remarks: z.string(),
});
export type NpsDetails = z.infer<typeof npsDetailsSchema>;
