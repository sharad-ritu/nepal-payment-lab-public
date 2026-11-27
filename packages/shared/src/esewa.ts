import { z } from "zod";

import {
  formatRupeeAmount as formatEsewaAmount,
  parseRupeeAmount as parseEsewaAmount,
} from "./amounts";
import { merchantUrlSchema } from "./merchant-urls";

export { formatEsewaAmount, parseEsewaAmount };

export function esewaRupeeNumber(minor: number): number {
  return Number(formatEsewaAmount(minor));
}

const rupeeAmount = z
  .string()
  .refine(
    (value) => parseEsewaAmount(value) !== null,
    "Enter a rupee amount like 100 or 100.50.",
  );

const txUuid = z
  .string()
  .min(1, "This field may not be blank.")
  .max(200)
  .regex(/^[A-Za-z0-9-]+$/, "Use alphanumeric characters and hyphens only.");

export const esewaFormSchema = z
  .object({
    amount: rupeeAmount,
    tax_amount: rupeeAmount,
    total_amount: rupeeAmount,
    transaction_uuid: txUuid,
    product_code: z.string().min(1, "This field may not be blank."),
    product_service_charge: rupeeAmount,
    product_delivery_charge: rupeeAmount,
    success_url: merchantUrlSchema,
    failure_url: merchantUrlSchema,
    signed_field_names: z.string(),
    signature: z.string().min(1, "This field may not be blank."),
  })
  .superRefine((input, context) => {
    if (
      input.signed_field_names !== "total_amount,transaction_uuid,product_code"
    ) {
      context.addIssue({
        code: "custom",
        path: ["signed_field_names"],
        message:
          "Sign total_amount,transaction_uuid,product_code in this order.",
      });
    }

    const amount = parseEsewaAmount(input.amount);
    const tax = parseEsewaAmount(input.tax_amount);
    const service = parseEsewaAmount(input.product_service_charge);
    const delivery = parseEsewaAmount(input.product_delivery_charge);
    const total = parseEsewaAmount(input.total_amount);
    if (
      amount === null ||
      tax === null ||
      service === null ||
      delivery === null ||
      total === null
    )
      return;
    if (amount + tax + service + delivery !== total) {
      context.addIssue({
        code: "custom",
        path: ["total_amount"],
        message:
          "Total must equal amount plus tax, service, and delivery charges.",
      });
    }
    if (total === 0) {
      context.addIssue({
        code: "custom",
        path: ["total_amount"],
        message: "Total amount must be greater than zero.",
      });
    }
  });

export function esewaSignaturePayload({
  signedFieldNames,
  values,
}: {
  signedFieldNames: string;
  values: Record<string, string>;
}): string | null {
  const parts: string[] = [];

  for (const name of signedFieldNames.split(",")) {
    const value = values[name];
    if (value === undefined) return null;
    parts.push(`${name}=${value}`);
  }

  return parts.join(",");
}

const esewaStatusSchema = z.enum([
  "COMPLETE",
  "PENDING",
  "AMBIGUOUS",
  "NOT_FOUND",
  "CANCELED",
  "FULL_REFUND",
  "PARTIAL_REFUND",
]);
export type EsewaStatus = z.infer<typeof esewaStatusSchema>;

export const esewaStatusQuerySchema = z.object({
  product_code: z.string().trim().min(1),
  total_amount: z.string().trim().min(1),
  transaction_uuid: z.string().trim().min(1),
});
