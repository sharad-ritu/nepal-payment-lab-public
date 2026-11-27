import { expect, test } from "bun:test";
import {
  npsGatewaySchema,
  npsProcessSchema,
  npsSignaturePayload,
} from "../src/nps";

test("OnePG signs alphabetically sorted values without the Signature field", () => {
  expect(
    npsSignaturePayload({
      MerchantName: "TestMerchant",
      Signature: "excluded",
      MerchantId: "9",
    }),
  ).toBe("9TestMerchant");
  expect(
    npsSignaturePayload({
      MerchantTxnId: "Txn_01",
      Amount: "100.00",
      MerchantName: "testapi",
      MerchantId: "6300",
    }),
  ).toBe("100.006300testapiTxn_01");
});
const process = {
  MerchantId: "6300",
  MerchantName: "testapi",
  Amount: "100.00",
  MerchantTxnId: "Txn_01",
  Signature: "a".repeat(128),
};
test("process requests preserve signed decimal text", () => {
  expect(npsProcessSchema.parse(process).Amount).toBe("100.00");
});
test.each([
  { Amount: "0" },
  { Amount: "1.001" },
  { Amount: 100 },
  { Signature: "A".repeat(128) },
  { MerchantTxnId: "" },
  { Extra: "unsigned" },
])("rejects invalid signed process input: %j", (change) => {
  expect(npsProcessSchema.safeParse({ ...process, ...change }).success).toBe(
    false,
  );
});
test("gateway forms require process identity but no signature or authentication fields", () => {
  const { Signature: _signature, ...identity } = process;
  expect(
    npsGatewaySchema.parse({
      ...identity,
      ProcessId: "54D0A55C_4D9E_4EDC_A795_262101D09CF8",
      ResponseUrl: "http://localhost:4100/return",
    }),
  ).toMatchObject({ Amount: "100.00" });
  expect(
    npsGatewaySchema.safeParse({
      ...identity,
      ProcessId: "invalid",
      ResponseUrl: "https://user:password@example.com",
    }).success,
  ).toBe(false);
});
