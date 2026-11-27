import { expect, test } from "bun:test";
import { verifyEsewaSignature } from "../../src/modules/esewa/contract";
import { digestSecret, matchesSecret } from "../../src/security/secrets";

// Published eSewa UAT message/key, not a merchant credential.
// The published example digest is inconsistent; this digest was checked
// independently with Python hashlib/hmac.
// https://developer.esewa.com.np/pages/Epay
const esewaExample = {
  message: "total_amount=100,transaction_uuid=11-201-13,product_code=EPAYTEST",
  secret: "8gBm/:&EnhH.1/q",
  signature: "5DZywcrTKD0gia/rsSMcrRHmJl+4Tbol6S+lWgdJ94E=",
};

test("verifies HMAC-SHA256 for the eSewa UAT message and key", () => {
  expect(verifyEsewaSignature(esewaExample)).toBe(true);
});

test.each([
  { message: esewaExample.message.replace("100", "100.00") },
  { secret: "a-different-test-secret" },
  { signature: "invalid" },
  { signature: "A".repeat(44) },
])("rejects a modified signed value, secret, or signature: %j", (change) => {
  expect(verifyEsewaSignature({ ...esewaExample, ...change })).toBe(false);
});

const sha256Abc =
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

test("credential authentication matches a known SHA-256 digest", () => {
  expect(digestSecret("abc")).toBe(sha256Abc);
  expect(matchesSecret({ secret: "abc", digest: sha256Abc })).toBe(true);
});

test.each(["", "malformed", "00", "ff".repeat(32)])(
  "rejects a different or malformed credential digest: %s",
  (digest) => {
    expect(matchesSecret({ secret: "abc", digest })).toBe(false);
  },
);
