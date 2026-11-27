import { describe, expect, test } from "bun:test";
import {
  esewaFormSchema,
  esewaSignaturePayload,
  formatEsewaAmount,
  parseEsewaAmount,
} from "../src/esewa";

describe("eSewa amount and signature boundaries", () => {
  test.each([
    { text: "0", minor: 0 },
    { text: "100", minor: 10000 },
    { text: "100.50", minor: 10050 },
    { text: "0.01", minor: 1 },
    { text: "999999999.99", minor: 99999999999 },
  ])("parses $text rupees into $minor paisa", ({ text, minor }) => {
    expect(parseEsewaAmount(text)).toBe(minor);
  });

  test.each(["", "-1", "1.001", "1e3", "Infinity", "1,000", "1000000000"])(
    "rejects an invalid or excessive amount: %s",
    (value) => {
      expect(parseEsewaAmount(value)).toBeNull();
    },
  );

  test.each([
    { minor: 10000, text: "100" },
    { minor: 10050, text: "100.5" },
    { minor: 10001, text: "100.01" },
    { minor: 1, text: "0.01" },
  ])("formats $minor paisa as signed rupee text $text", ({ minor, text }) => {
    expect(formatEsewaAmount(minor)).toBe(text);
  });

  test("builds the documented signing order while preserving field text", () => {
    expect(
      esewaSignaturePayload({
        signedFieldNames: "total_amount,transaction_uuid,product_code",
        values: {
          product_code: "EPAYTEST",
          transaction_uuid: "ORDER-001",
          total_amount: "100.50",
        },
      }),
    ).toBe(
      "total_amount=100.50,transaction_uuid=ORDER-001,product_code=EPAYTEST",
    );
  });

  test("a missing signed field cannot produce a signature message", () => {
    expect(
      esewaSignaturePayload({
        signedFieldNames: "total_amount,transaction_uuid,product_code",
        values: { total_amount: "100" },
      }),
    ).toBeNull();
  });
});

const form = {
  amount: "100.50",
  tax_amount: "0",
  total_amount: "100.50",
  transaction_uuid: "ORDER-001",
  product_code: "lab_test_fixture",
  product_service_charge: "0",
  product_delivery_charge: "0",
  success_url: "http://localhost:4100/success",
  failure_url: "http://localhost:4100/failure",
  signed_field_names: "total_amount,transaction_uuid,product_code",
  signature: "test-signature",
};

test("form validation preserves the signed decimal representation", () => {
  expect(esewaFormSchema.parse(form).total_amount).toBe("100.50");
});

test("decimal charges must sum to the total in paisa", () => {
  expect(
    esewaFormSchema.safeParse({
      ...form,
      amount: "0.10",
      tax_amount: "0.20",
      total_amount: "0.30",
    }).success,
  ).toBe(true);
  expect(
    esewaFormSchema.safeParse({ ...form, total_amount: "100.51" }).success,
  ).toBe(false);
});

test.each([
  { amount: "0", total_amount: "0" },
  { transaction_uuid: " ORDER-001 " },
  { transaction_uuid: "ORDER_001" },
  { signed_field_names: "product_code,total_amount,transaction_uuid" },
  { success_url: "javascript:alert(1)" },
  { failure_url: "https://user:password@example.com/return" },
])("rejects an invalid ePay form: %j", (changes) => {
  expect(esewaFormSchema.safeParse({ ...form, ...changes }).success).toBe(
    false,
  );
});
