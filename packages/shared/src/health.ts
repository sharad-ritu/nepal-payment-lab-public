import { z } from "zod";

const healthResponseSchema = z.object({
  kind: z.literal("healthy"),
  service: z.literal("nepal-payment-lab-api"),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
