import { expect, test } from "bun:test";
import {
  connectipsFormSchema,
  connectipsValidateSchema,
} from "../src/connectips";

const verification = {
  merchantId: 550,
  appId: "MER-550-APP-1",
  referenceId: "txn-123",
  txnAmt: 500,
  token: "test-token",
};

test("accepts documented numeric IDs and paisa, normalizing to text", () => {
  expect(connectipsValidateSchema.parse(verification)).toEqual({
    ...verification,
    merchantId: "550",
    txnAmt: "500",
  });
  expect(
    connectipsValidateSchema.parse({
      ...verification,
      merchantId: "550",
      txnAmt: "500",
    }).txnAmt,
  ).toBe("500");
});

test.each([
  { txnAmt: 0 },
  { txnAmt: -1 },
  { txnAmt: 1.5 },
  { txnAmt: 100000000000 },
  { txnAmt: "0" },
  { txnAmt: "1.5" },
  { txnAmt: "100000000000" },
  { merchantId: -1 },
  { merchantId: 1.5 },
  { token: "" },
  { token: "a".repeat(513) },
])("rejects malformed verification input: %j", (changes) => {
  expect(
    connectipsValidateSchema.safeParse({ ...verification, ...changes }).success,
  ).toBe(false);
});

const form = {
  MERCHANTID: "550",
  APPID: "lab_test_fixture",
  APPNAME: "Test merchant",
  TXNID: "ORDER-001",
  TXNDATE: "29-02-2024",
  TXNCRNCY: "NPR",
  TXNAMT: "120000",
  REFERENCEID: "REF-001",
  REMARKS: "Local test",
  PARTICULARS: "Test payment",
  TOKEN: "a".repeat(512),
};

test("accepts a leap-day gateway form with a 512-character token", () => {
  expect(connectipsFormSchema.safeParse(form).success).toBe(true);
});

test.each([
  { TXNDATE: "29-02-2025" },
  { TXNDATE: "31-04-2026" },
  { TXNCRNCY: "USD" },
  { TXNAMT: "0" },
  { TXNID: "a".repeat(21) },
  { TOKEN: "a".repeat(513) },
])("rejects an invalid gateway form: %j", (changes) => {
  expect(connectipsFormSchema.safeParse({ ...form, ...changes }).success).toBe(
    false,
  );
});

test("discards form return URLs because destinations are registered", () => {
  const parsed = connectipsFormSchema.parse({
    ...form,
    SUCCESSURL: "http://form-success.test/return",
    FAILUREURL: "file:///tmp/return",
  });

  expect(Object.keys(parsed).sort()).toEqual(Object.keys(form).sort());
});
