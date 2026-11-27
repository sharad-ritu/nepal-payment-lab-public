import type { PaymentRecord } from "@nepal-payment-lab/database";
import {
  type ConnectipsStatus,
  providerStatuses,
  type ScenarioSnapshot,
  scenarioSnapshotSchema,
} from "@nepal-payment-lab/shared";

export function connectipsValidationStatus(
  status: ScenarioSnapshot["redirectStatus"],
): {
  status: ConnectipsStatus;
  statusDesc: string;
} {
  return {
    status: providerStatuses.connectips[status],
    statusDesc:
      status === "completed"
        ? "TRANSACTION SUCCESSFUL"
        : status === "cancelled"
          ? "TRANSACTION UNSUCCESSFUL"
          : status === "expired"
            ? "TRANSACTION NOT FOUND"
            : "TRANSACTION INCOMPLETE",
  };
}

export function connectipsMerchantReturn({
  payment,
}: {
  payment: PaymentRecord;
}) {
  const scenario = scenarioSnapshotSchema.parse(payment.scenarioSnapshot);
  const completed = scenario.redirectStatus === "completed";
  const target = new URL(
    completed ? payment.returnUrl : (payment.failureUrl ?? payment.returnUrl),
  );
  target.searchParams.set("TXNID", payment.orderId);

  return { url: target.href };
}

function stableInt(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (const char of value)
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;

  return hash;
}

// Lab receipt values. Bank, batch, and charge figures are synthetic.
export function connectipsTxnFacts(payment: PaymentRecord) {
  return {
    debitBankCode: "9999",
    txnId: stableInt(payment.providerPaymentId, 7),
    batchId: stableInt(payment.providerPaymentId, 13),
    txnDate: (payment.simulatedAt ?? payment.createdAt).getTime(),
    txnCrncy: null,
    chargeAmt: 0,
    chargeLiability: "CG",
  };
}
