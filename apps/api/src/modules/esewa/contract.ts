import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentRecord } from "@nepal-payment-lab/database";
import {
  esewaReturnStatuses,
  esewaSignaturePayload,
  formatEsewaAmount,
  scenarioSnapshotSchema,
} from "@nepal-payment-lab/shared";

function signEsewaMessage({
  message,
  secret,
}: {
  message: string;
  secret: string;
}): string {
  return createHmac("sha256", secret).update(message).digest("base64");
}

export function verifyEsewaSignature({
  message,
  signature,
  secret,
}: {
  message: string;
  signature: string;
  secret: string;
}): boolean {
  const expected = Buffer.from(signEsewaMessage({ message, secret }));
  const actual = Buffer.from(signature);

  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

const signedFieldNames =
  "transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names";

export function esewaMerchantReturn({
  payment,
  secret,
}: {
  payment: PaymentRecord;
  secret: string;
}) {
  const scenario = scenarioSnapshotSchema.parse(payment.scenarioSnapshot);
  const completed = scenario.redirectStatus === "completed";
  const target = new URL(
    completed ? payment.returnUrl : (payment.failureUrl ?? payment.returnUrl),
  );
  const totalAmount = formatEsewaAmount(payment.amountMinor);
  const values = {
    transaction_code: completed ? payment.transactionId : "",
    status: esewaReturnStatuses[scenario.redirectStatus],
    total_amount: totalAmount,
    transaction_uuid: payment.orderId,
    product_code: payment.orderName,
    signed_field_names: signedFieldNames,
  };
  const message = esewaSignaturePayload({
    signedFieldNames,
    values,
  });
  if (!message) throw new Error("Missing eSewa signed response fields.");

  const data = {
    ...values,
    signature: signEsewaMessage({ message, secret }),
  };
  target.searchParams.set(
    "data",
    Buffer.from(JSON.stringify(data)).toString("base64"),
  );

  return { url: target.href, data };
}
