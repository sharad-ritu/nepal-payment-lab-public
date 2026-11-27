import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentRecord } from "@nepal-payment-lab/database";
import {
  formatRupeeAmount,
  npsDetailsSchema,
  npsSignaturePayload,
  providerStatuses,
  type ScenarioSnapshot,
} from "@nepal-payment-lab/shared";

export function verifyNpsSignature({
  values,
  secret,
}: {
  values: Record<string, string>;
  secret: string;
}) {
  const signature = values.Signature;
  if (!signature || !/^[a-f0-9]{128}$/.test(signature)) return false;
  const expected = createHmac("sha512", secret)
    .update(npsSignaturePayload(values), "utf8")
    .digest();
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function npsReturnUrl(payment: PaymentRecord) {
  const url = new URL(payment.returnUrl);
  url.searchParams.set("MerchantTxnId", payment.orderId);
  url.searchParams.set("GatewayTxnId", payment.transactionId);
  return url.href;
}

export const npsInstrumentCode = "TMBANK";
export const npsServiceCharge = 5;
export const npsInstruments = [
  {
    InstitutionName: "Test Bank",
    InstrumentName: "Test Bank",
    InstrumentCode: npsInstrumentCode,
    InstrumentValue: null,
    LogoUrl: "",
    BankUrl: "MBanking",
    BankType: "MBanking",
  },
];

export function npsSuccess<T>(data: T, message = "Success") {
  return { code: "0", message, errors: [], data };
}

export function npsError(message: string, code = "1") {
  return {
    code: "1",
    message: "Error",
    errors: [{ error_code: code, error_message: message }],
    data: null,
  };
}

export function npsTransactionData({
  payment,
  status,
  amountMinor,
}: {
  payment: PaymentRecord;
  status: ScenarioSnapshot["redirectStatus"];
  amountMinor: number;
}) {
  const details = npsDetailsSchema.parse(payment.providerDetails);
  return {
    GatewayReferenceNo: payment.transactionId,
    Amount: formatRupeeAmount(amountMinor),
    ServiceCharge: String(npsServiceCharge),
    TransactionRemarks: details.remarks,
    TransactionRemarks2: "",
    TransactionRemarks3: "",
    ProcessId: payment.providerPaymentId,
    TransactionDate: (payment.simulatedAt ?? payment.createdAt)
      .toISOString()
      .slice(0, 19)
      .replace("T", " "),
    MerchantTxnId: payment.orderId,
    CbsMessage:
      status === "cancelled" || status === "expired"
        ? "Transaction failed"
        : "",
    Status: providerStatuses.nps[status],
    Institution: "Test Bank",
    Instrument: "Test MBanking",
    PaymentCurrency: "NPR",
    ExchangeRate: "1",
  };
}
