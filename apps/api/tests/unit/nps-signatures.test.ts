import { expect, test } from "bun:test";
import { verifyNpsSignature } from "../../src/modules/nps/contract";

// RFC 4231 test case 1: independent HMAC-SHA512 known-answer fixture.
const signature =
  "87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cde" +
  "daa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854";
test("verifies a known HMAC-SHA512 value", () => {
  expect(
    verifyNpsSignature({
      values: { MerchantName: "Hi There", Signature: signature },
      secret: "\x0b".repeat(20),
    }),
  ).toBe(true);
});
test("rejects tampered payload text and malformed signatures", () => {
  expect(
    verifyNpsSignature({
      values: { MerchantName: "Hi There!", Signature: signature },
      secret: "\x0b".repeat(20),
    }),
  ).toBe(false);
  expect(
    verifyNpsSignature({
      values: { MerchantName: "Hi There", Signature: "not-a-signature" },
      secret: "\x0b".repeat(20),
    }),
  ).toBe(false);
});
