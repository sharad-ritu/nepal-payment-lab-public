import type { PaymentRecord } from "@nepal-payment-lab/database";

export const expiry = new Date("2026-01-01T01:00:00.000Z");
export const beforeExpiry = new Date("2026-01-01T00:59:59.999Z");

export function paymentFixture(
  overrides: Partial<PaymentRecord> = {},
): PaymentRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    accountId: "00000000-0000-4000-8000-000000000002",
    providerPaymentId: "lab_KH_fixture",
    transactionId: "lab_txn_fixture",
    checkoutDigest: "fixture-digest",
    orderId: "ORDER-001",
    orderName: "Test order",
    amountMinor: 120000,
    returnUrl: "http://merchant.test/success?existing=keep",
    failureUrl: "http://merchant.test/failure?existing=keep",
    providerDetails: null,
    scenarioKey: "normal-completion",
    scenarioSnapshot: {
      version: 1,
      key: "normal-completion",
      redirectStatus: "completed",
      lookup: { kind: "payment", status: "completed", amountDelta: 0 },
    },
    simulatedAt: null,
    expiresAt: expiry,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}
