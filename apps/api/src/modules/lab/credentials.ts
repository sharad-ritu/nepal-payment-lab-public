import { randomBytes } from "node:crypto";
import { digestSecret } from "../../security/secrets";

export function makeCredential() {
  const prefix = `lab_test_${randomBytes(12).toString("hex")}`;
  const secret = `${prefix}.${randomBytes(32).toString("base64url")}`;

  return { secret, key: { prefix, digest: digestSecret(secret) } };
}
