import { z } from "zod";

export const khaltiMerchantMetadataSchema = z.record(
  z.string().startsWith("merchant_"),
  z.json(),
);

export const khaltiDetailsSchema = z.object({
  merchantMetadata: khaltiMerchantMetadataSchema.default({}),
});
export type KhaltiDetails = z.infer<typeof khaltiDetailsSchema>;
