import { z } from "zod";
import { providerSchema } from "./providers";
import { scenarioKeySchema } from "./scenarios";

export const checkoutTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const checkoutSelectionSchema = z
  .object({ scenarioKey: scenarioKeySchema })
  .strict();

export const checkoutSchema = z.object({
  provider: providerSchema,
  orderId: z.string(),
  orderName: z.string(),
  amountMinor: z.number().int(),
  scenarioKey: scenarioKeySchema,
  expiresAt: z.iso.datetime(),
  used: z.boolean(),
  returnHost: z.string(),
  failureHost: z.string().nullable(),
});
