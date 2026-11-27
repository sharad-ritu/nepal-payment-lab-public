import { z } from "zod";

export const scenarioKeySchema = z.enum([
  "normal-completion",
  "pending-payment",
  "user-cancellation",
  "completed-redirect-pending-lookup",
  "amount-mismatch",
  "expired-payment",
  "lookup-timeout",
  "invalid-payment-id",
  "lookup-server-error",
  "completed-redirect-cancelled-lookup",
  "completed-redirect-expired-lookup",
]);
export type ScenarioKey = z.infer<typeof scenarioKeySchema>;

const paymentStatusSchema = z.enum([
  "initiated",
  "completed",
  "pending",
  "cancelled",
  "expired",
]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const scenarioSnapshotSchema = z.object({
  version: z.literal(1),
  key: scenarioKeySchema,
  redirectStatus: paymentStatusSchema,
  lookup: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("payment"),
      status: paymentStatusSchema,
      amountDelta: z.number().int(),
    }),
    z.object({
      kind: z.literal("timeout"),
      delayMs: z.number().int().positive().max(60000),
    }),
    z.object({ kind: z.literal("not_found") }),
    z.object({ kind: z.literal("server_error") }),
  ]),
});
export type ScenarioSnapshot = z.infer<typeof scenarioSnapshotSchema>;

type Scenario<Key extends ScenarioKey> = {
  name: string;
  description: string;
  expectation: string;
  snapshot: ScenarioSnapshot & { key: Key };
};

export const scenarios = {
  "normal-completion": {
    name: "Full success",
    description: "The browser return and verification both report success.",
    expectation: "Fulfill the order once, after verifying its amount and ID.",
    snapshot: {
      version: 1,
      key: "normal-completion",
      redirectStatus: "completed",
      lookup: { kind: "payment", status: "completed", amountDelta: 0 },
    },
  },
  "pending-payment": {
    name: "Pending payment",
    description: "Verification stays pending until the checkout expires.",
    expectation: "Keep the order unpaid and hold fulfillment.",
    snapshot: {
      version: 1,
      key: "pending-payment",
      redirectStatus: "pending",
      lookup: { kind: "payment", status: "pending", amountDelta: 0 },
    },
  },
  "user-cancellation": {
    name: "User cancellation",
    description: "The shopper cancels the payment.",
    expectation: "Do not fulfill the canceled order.",
    snapshot: {
      version: 1,
      key: "user-cancellation",
      redirectStatus: "cancelled",
      lookup: { kind: "payment", status: "cancelled", amountDelta: 0 },
    },
  },
  "completed-redirect-pending-lookup": {
    name: "Success return, pending verification",
    description:
      "The browser reports success, but verification stays pending until expiry.",
    expectation: "Trust verification and keep the order unpaid.",
    snapshot: {
      version: 1,
      key: "completed-redirect-pending-lookup",
      redirectStatus: "completed",
      lookup: { kind: "payment", status: "pending", amountDelta: 0 },
    },
  },
  "amount-mismatch": {
    name: "Amount mismatch",
    description:
      "Verification reports one paisa more than the requested amount.",
    expectation: "Reject the mismatched amount and hold fulfillment.",
    snapshot: {
      version: 1,
      key: "amount-mismatch",
      redirectStatus: "completed",
      lookup: { kind: "payment", status: "completed", amountDelta: 1 },
    },
  },
  "expired-payment": {
    name: "Expired payment",
    description: "The payment expires without completing.",
    expectation: "Do not fulfill the expired order.",
    snapshot: {
      version: 1,
      key: "expired-payment",
      redirectStatus: "expired",
      lookup: { kind: "payment", status: "expired", amountDelta: 0 },
    },
  },
  "lookup-timeout": {
    name: "Verification timeout",
    description: "Verification waits 60 seconds, then closes the connection.",
    expectation: "Handle the timeout without marking the order paid.",
    snapshot: {
      version: 1,
      key: "lookup-timeout",
      redirectStatus: "completed",
      lookup: { kind: "timeout", delayMs: 60000 },
    },
  },
  "invalid-payment-id": {
    name: "Payment not found",
    description: "Verification cannot find the returned payment reference.",
    expectation: "Keep the order unpaid when verification cannot confirm it.",
    snapshot: {
      version: 1,
      key: "invalid-payment-id",
      redirectStatus: "completed",
      lookup: { kind: "not_found" },
    },
  },
  "lookup-server-error": {
    name: "Success return, verification server error",
    description:
      "The browser reports success, but verification returns HTTP 500.",
    expectation: "Keep the order unpaid when verification is unavailable.",
    snapshot: {
      version: 1,
      key: "lookup-server-error",
      redirectStatus: "completed",
      lookup: { kind: "server_error" },
    },
  },
  "completed-redirect-cancelled-lookup": {
    name: "Success return, canceled verification",
    description:
      "The browser reports success, but verification reports cancellation.",
    expectation: "Keep the order unpaid.",
    snapshot: {
      version: 1,
      key: "completed-redirect-cancelled-lookup",
      redirectStatus: "completed",
      lookup: { kind: "payment", status: "cancelled", amountDelta: 0 },
    },
  },
  "completed-redirect-expired-lookup": {
    name: "Success return, expired verification",
    description:
      "The browser reports success, but verification reports expiry.",
    expectation: "Keep the order unpaid.",
    snapshot: {
      version: 1,
      key: "completed-redirect-expired-lookup",
      redirectStatus: "completed",
      lookup: { kind: "payment", status: "expired", amountDelta: 0 },
    },
  },
} satisfies { [Key in ScenarioKey]: Scenario<Key> };
