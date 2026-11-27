import { createHash, timingSafeEqual } from "node:crypto";

export function digestSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function matchesSecret({
  secret,
  digest,
}: {
  secret: string;
  digest: string;
}) {
  const actual = Buffer.from(digestSecret(secret), "hex");
  const expected = Buffer.from(digest, "hex");

  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
