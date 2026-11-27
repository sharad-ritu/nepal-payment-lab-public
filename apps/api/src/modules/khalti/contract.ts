import type { PaymentRecord } from "@nepal-payment-lab/database";
import {
  createMerchantUrlSchema,
  khaltiDetailsSchema,
  khaltiMerchantMetadataSchema,
  maxAmountMinor,
  providerStatuses,
  scenarioSnapshotSchema,
} from "@nepal-payment-lab/shared";
import { z } from "zod";
import type { LookupDecision } from "../simulation";

const requiredText = z
  .string({ error: "This field is required." })
  .trim()
  .min(1, "This field may not be blank.")
  .max(200);

const url = z
  .string({ error: "This field is required." })
  .min(1, "This field may not be blank.")
  .pipe(createMerchantUrlSchema("Enter a valid URL."));

const amount = z
  .union([
    z.number(),
    z.string().regex(/^\d+$/, "A valid integer is required.").transform(Number),
  ])
  .pipe(
    z
      .number()
      .int("A valid integer is required.")
      .min(100, "Amount should be greater than Rs. 1 that is 100 paisa.")
      .max(maxAmountMinor),
  );

// Keep only provider-defined metadata; payer and product details are discarded.
const metadataInputSchema = z
  .record(z.string(), z.unknown())
  .transform((input) =>
    Object.fromEntries(
      Object.entries(input).filter(([key]) => key.startsWith("merchant_")),
    ),
  )
  .pipe(khaltiMerchantMetadataSchema)
  .transform((merchantMetadata) => ({ merchantMetadata }));

const initiationBodySchema = z
  .object({
    return_url: url,
    website_url: url,
    amount,
    purchase_order_id: requiredText,
    purchase_order_name: requiredText,
    // Optional payer details are accepted for compatibility but never persisted.
    customer_info: z
      .object({
        name: z.string().optional(),
        email: z.email().optional(),
        phone: z.string().optional(),
      })
      .optional(),
    amount_breakdown: z
      .array(
        z.object({ label: z.string(), amount: z.number().int().nonnegative() }),
      )
      .optional(),
  })
  .superRefine((input, context) => {
    if (
      input.amount_breakdown &&
      input.amount_breakdown.reduce((sum, item) => sum + item.amount, 0) !==
        input.amount
    ) {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Amount Breakdown mismatch.",
      });
    }
  });

export const initiationSchema = initiationBodySchema.and(metadataInputSchema);

export const lookupSchema = z.object({ pidx: requiredText });

// The sandbox reports expiry in Nepal time with microsecond precision.
export function khaltiTimestamp(date: Date): string {
  const nepal = new Date(date.getTime() + 345 * 60000);

  return `${nepal.toISOString().slice(0, 23)}000+05:45`;
}

export function khaltiLookupResponse({
  payment,
  outcome,
}: {
  payment: PaymentRecord;
  outcome: Exclude<LookupDecision, { kind: "timeout" }>;
}) {
  if (outcome.kind === "server_error") {
    return {
      status: 500,
      body: { detail: "Internal server error." },
    };
  }
  if (outcome.kind === "not_found") {
    return {
      status: 404,
      body: {
        detail: "Not found.",
        error_key: "validation_error",
      },
    };
  }

  return {
    status:
      outcome.status === "expired" || outcome.status === "cancelled"
        ? 400
        : 200,
    body: {
      pidx: payment.providerPaymentId,
      total_amount: outcome.amountMinor,
      status: providerStatuses.khalti[outcome.status],
      transaction_id:
        outcome.status === "completed" ? payment.transactionId : null,
      fee: 0,
      refunded: false,
    },
  };
}

// Mirrors JavaScript's String() for parsed JSON, as the sandbox does, without
// calling methods on merchant-supplied objects such as {"toString": null}.
function stringifyMetadata(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value))
    return value
      .map((item) => (item === null ? "" : stringifyMetadata(item)))
      .join(",");
  if (typeof value === "object") return "[object Object]";

  return String(value);
}

export function merchantReturn(payment: PaymentRecord) {
  const scenario = scenarioSnapshotSchema.parse(payment.scenarioSnapshot);
  const completed = scenario.redirectStatus === "completed";
  const target = new URL(payment.returnUrl);
  const transactionId = completed ? payment.transactionId : "";
  // Field order, the txnId alias, and the masked payer number follow the sandbox.
  const values: Record<string, string> = {
    pidx: payment.providerPaymentId,
    transaction_id: transactionId,
    tidx: transactionId,
    txnId: transactionId,
    amount: String(payment.amountMinor),
    total_amount: String(payment.amountMinor),
    mobile: scenario.redirectStatus === "cancelled" ? "" : "98XXXXX000",
    status: providerStatuses.khalti[scenario.redirectStatus],
    purchase_order_id: payment.orderId,
    purchase_order_name: payment.orderName,
  };

  if (completed) {
    // Retained payments created before metadata support have null details.
    const details = khaltiDetailsSchema.parse(payment.providerDetails ?? {});
    for (const [key, value] of Object.entries(details.merchantMetadata)) {
      values[key] = stringifyMetadata(value);
    }
  }

  for (const [key, value] of Object.entries(values))
    target.searchParams.set(key, value);
  return { url: target.href, values };
}
