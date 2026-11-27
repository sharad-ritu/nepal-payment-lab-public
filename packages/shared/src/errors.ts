import { z } from "zod";

export const apiErrorSchema = z.object({
  kind: z.string(),
  message: z.string(),
});
