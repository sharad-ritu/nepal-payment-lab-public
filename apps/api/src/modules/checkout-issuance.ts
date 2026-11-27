import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createPayment, type Database } from "@nepal-payment-lab/database";
import {
  type ConnectipsProviderDetails,
  type KhaltiDetails,
  type NpsDetails,
  type Provider,
  providerCheckoutMinutes,
  type ScenarioSnapshot,
} from "@nepal-payment-lab/shared";
import { digestSecret } from "../security/secrets";

const paymentPrefixes = {
  khalti: "KH",
  esewa: "ES",
  connectips: "CI",
} satisfies Record<Exclude<Provider, "nps">, string>;

type CheckoutRequest = {
  db: Database;
  webOrigin: string;
  accountId: string;
  orderId: string;
  orderName: string;
  amountMinor: number;
  returnUrl: string;
  scenario: ScenarioSnapshot;
} & (
  | {
      provider: "khalti";
      details: KhaltiDetails;
    }
  | {
      provider: "esewa";
      failureUrl: string;
    }
  | { provider: "nps"; details: NpsDetails }
  | {
      provider: "connectips";
      failureUrl: string;
      details: ConnectipsProviderDetails;
    }
);

export function npsCheckoutToken(processId: string): string {
  return createHash("sha256")
    .update(`nps-checkout:${processId}`)
    .digest("base64url");
}

export async function issueCheckout(input: CheckoutRequest) {
  const paymentId =
    input.provider === "nps"
      ? randomUUID().replaceAll("-", "_").toUpperCase()
      : `lab_${paymentPrefixes[input.provider]}_${randomBytes(16).toString("hex")}`;
  const token =
    input.provider === "nps"
      ? npsCheckoutToken(paymentId)
      : randomBytes(32).toString("base64url");
  const expiresIn = providerCheckoutMinutes[input.provider] * 60;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  const payment = await createPayment({
    db: input.db,
    rejectDuplicateReference: input.provider !== "khalti",
    payment: {
      accountId: input.accountId,
      providerPaymentId: paymentId,
      transactionId:
        input.provider === "nps"
          ? String(BigInt(`0x${randomBytes(6).toString("hex")}`))
          : `lab_txn_${randomBytes(16).toString("hex")}`,
      checkoutDigest: digestSecret(token),
      orderId: input.orderId,
      orderName: input.orderName,
      amountMinor: input.amountMinor,
      returnUrl: input.returnUrl,
      failureUrl:
        input.provider === "khalti" || input.provider === "nps"
          ? null
          : input.failureUrl,
      providerDetails: input.provider === "esewa" ? null : input.details,
      scenarioKey: input.scenario.key,
      scenarioSnapshot: input.scenario,
      expiresAt,
    },
  });
  if (!payment) return null;

  return {
    paymentId,
    paymentUrl: new URL(`/checkout/${token}`, input.webOrigin).href,
    expiresAt,
    expiresIn,
  };
}
