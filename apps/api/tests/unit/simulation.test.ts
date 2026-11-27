import { describe, expect, test } from "bun:test";
import { type ScenarioKey, scenarios } from "@nepal-payment-lab/shared";
import {
  decideLookup,
  type LookupDecision,
} from "../../src/modules/simulation";
import { beforeExpiry, expiry, paymentFixture } from "../fixtures";

describe("payment verification decisions", () => {
  test("an unused checkout is initiated until its exact deadline", () => {
    const payment = paymentFixture();
    expect(decideLookup({ payment, now: beforeExpiry })).toEqual({
      kind: "payment",
      status: "initiated",
      amountMinor: 120000,
    });
    expect(decideLookup({ payment, now: expiry })).toEqual({
      kind: "payment",
      status: "expired",
      amountMinor: 120000,
    });
  });

  const cases = [
    {
      key: "normal-completion",
      result: { kind: "payment", status: "completed", amountMinor: 120000 },
    },
    {
      key: "pending-payment",
      result: { kind: "payment", status: "pending", amountMinor: 120000 },
    },
    {
      key: "user-cancellation",
      result: { kind: "payment", status: "cancelled", amountMinor: 120000 },
    },
    {
      key: "completed-redirect-pending-lookup",
      result: { kind: "payment", status: "pending", amountMinor: 120000 },
    },
    {
      key: "amount-mismatch",
      result: { kind: "payment", status: "completed", amountMinor: 120001 },
    },
    {
      key: "expired-payment",
      result: { kind: "payment", status: "expired", amountMinor: 120000 },
    },
    { key: "lookup-timeout", result: { kind: "timeout", delayMs: 60000 } },
    { key: "invalid-payment-id", result: { kind: "not_found" } },
    { key: "lookup-server-error", result: { kind: "server_error" } },
    {
      key: "completed-redirect-cancelled-lookup",
      result: { kind: "payment", status: "cancelled", amountMinor: 120000 },
    },
    {
      key: "completed-redirect-expired-lookup",
      result: { kind: "payment", status: "expired", amountMinor: 120000 },
    },
  ] satisfies { key: ScenarioKey; result: LookupDecision }[];

  test.each(cases)(
    "uses the saved verification outcome for $key",
    ({ key, result }) => {
      const payment = paymentFixture({
        scenarioKey: key,
        scenarioSnapshot: scenarios[key].snapshot,
        simulatedAt: new Date("2026-01-01T00:30:00.000Z"),
      });
      expect(decideLookup({ payment, now: beforeExpiry })).toEqual(result);
    },
  );

  test("a preselected scenario does not apply before checkout is submitted", () => {
    const payment = paymentFixture({
      scenarioKey: "lookup-server-error",
      scenarioSnapshot: scenarios["lookup-server-error"].snapshot,
    });
    expect(decideLookup({ payment, now: beforeExpiry })).toEqual({
      kind: "payment",
      status: "initiated",
      amountMinor: 120000,
    });
  });

  test("pending expires at the deadline without mutating its saved snapshot", () => {
    const payment = paymentFixture({
      simulatedAt: beforeExpiry,
      scenarioSnapshot: scenarios["pending-payment"].snapshot,
    });
    const original = structuredClone(payment);
    expect(decideLookup({ payment, now: expiry })).toEqual({
      kind: "payment",
      status: "expired",
      amountMinor: 120000,
    });
    expect(payment).toEqual(original);
    expect(decideLookup({ payment, now: beforeExpiry }).kind).toBe("payment");
  });

  test.each(["normal-completion", "user-cancellation"] satisfies ScenarioKey[])(
    "%s remains stable after its checkout deadline",
    (key) => {
      const payment = paymentFixture({
        simulatedAt: beforeExpiry,
        scenarioSnapshot: scenarios[key].snapshot,
      });
      expect(
        decideLookup({ payment, now: new Date("2026-01-02T00:00:00Z") }),
      ).toEqual(decideLookup({ payment, now: beforeExpiry }));
    },
  );
});
