import type { PaymentRecord } from "@nepal-payment-lab/database";
import {
  type ScenarioSnapshot,
  scenarioSnapshotSchema,
} from "@nepal-payment-lab/shared";

export type LookupDecision =
  | {
      kind: "payment";
      status: ScenarioSnapshot["redirectStatus"];
      amountMinor: number;
    }
  | Exclude<ScenarioSnapshot["lookup"], { kind: "payment" }>;

export function decideLookup({
  payment,
  now,
}: {
  payment: PaymentRecord;
  now: Date;
}): LookupDecision {
  const snapshot = scenarioSnapshotSchema.parse(payment.scenarioSnapshot);
  const outcome = !payment.simulatedAt
    ? ({
        kind: "payment",
        status: now >= payment.expiresAt ? "expired" : "initiated",
        amountDelta: 0,
      } satisfies ScenarioSnapshot["lookup"])
    : snapshot.lookup;
  if (outcome.kind !== "payment") return outcome;
  const status =
    outcome.status === "pending" && now >= payment.expiresAt
      ? "expired"
      : outcome.status;
  return {
    kind: "payment",
    status,
    amountMinor: payment.amountMinor + outcome.amountDelta,
  };
}
