import { expect } from "bun:test";
import { createHmac } from "node:crypto";
import { npsMerchantId } from "@nepal-payment-lab/shared";
import { z } from "zod";
import { type Api, type Credential, credentials, dashboard } from "./support";

export function npsIdentity(credential: Credential) {
  return {
    MerchantId: npsMerchantId(credential.key.prefix),
    MerchantName: credential.key.prefix,
  };
}
export function signedNps(
  credential: Credential,
  values: Record<string, string>,
) {
  const message = Object.keys(values)
    .sort()
    .map((key) => values[key])
    .join("");
  return {
    ...values,
    Signature: createHmac("sha512", credential.secret)
      .update(message, "utf8")
      .digest("hex"),
  };
}
export function npsRequest(
  api: Api,
  credential: Credential,
  path: string,
  values: Record<string, string>,
  scenario?: string,
) {
  return api.request(`/nps/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${credential.key.prefix}:${credential.secret}`).toString("base64")}`,
      "Content-Type": "application/json",
      ...(scenario ? { "Payment-Lab-Scenario": scenario } : {}),
    },
    body: JSON.stringify(signedNps(credential, values)),
  });
}
export async function configureNps(
  api: Api,
  {
    responseUrl = "http://merchant.test/success?existing=keep",
    credential,
  }: {
    responseUrl?: string;
    credential?: Credential;
  } = {},
) {
  const current = credential ?? (await credentials(api, { provider: "nps" }));
  const response = await dashboard(api, {
    provider: "nps",
    method: "PATCH",
    body: {
      initiationMode: "allow",
      responseUrl,
    },
  });
  expect(response.status).toBe(200);
  return current;
}
export async function createNpsProcess(
  api: Api,
  credential: Credential,
  orderId = "ORDER-001",
  scenario = "normal-completion",
) {
  const response = await npsRequest(
    api,
    credential,
    "GetProcessId",
    {
      ...npsIdentity(credential),
      Amount: "1200.50",
      MerchantTxnId: orderId,
    },
    scenario,
  );
  expect(response.status).toBe(200);
  const result = z
    .object({
      code: z.literal("0"),
      message: z.literal("Process Id generated successfully"),
      errors: z.array(z.unknown()).length(0),
      data: z
        .object({
          ProcessId: z
            .string()
            .regex(/^[A-F0-9]{8}(?:_[A-F0-9]{4}){3}_[A-F0-9]{12}$/),
        })
        .strict(),
    })
    .strict()
    .parse(await response.json());
  return { processId: result.data.ProcessId, orderId, credential };
}
export type NpsProcess = Awaited<ReturnType<typeof createNpsProcess>>;
export function gatewayValues(
  process: NpsProcess,
  overrides: Record<string, string> = {},
) {
  return {
    ...npsIdentity(process.credential),
    MerchantTxnId: process.orderId,
    Amount: "1200.50",
    ProcessId: process.processId,
    InstrumentCode: "TMBANK",
    TransactionRemarks: "Test checkout",
    ...overrides,
  };
}
export function npsGateway(
  api: Api,
  process: NpsProcess,
  overrides: Record<string, string> = {},
  multipart = false,
) {
  const values = gatewayValues(process, overrides);
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.append(key, value);
  return api.request("/nps/Payment/Index", {
    method: "POST",
    body: multipart ? form : new URLSearchParams(values),
  });
}
export async function openNpsCheckout(
  api: Api,
  process: NpsProcess,
  overrides: Record<string, string> = {},
  multipart = false,
) {
  const response = await npsGateway(api, process, overrides, multipart);
  expect(response.status).toBe(303);
  const location = response.headers.get("Location");
  if (!location) throw new Error("NPS gateway did not return checkout.");
  const token = new URL(location).pathname.split("/").at(-1);
  if (!token) throw new Error("Checkout token missing.");
  return {
    provider: "nps" as const,
    credential: process.credential,
    orderId: process.orderId,
    pidx: process.processId,
    token,
    checkoutUrl: location,
  };
}
export function npsVerification(
  api: Api,
  process: NpsProcess,
  credential = process.credential,
) {
  return npsRequest(api, credential, "CheckTransactionStatus", {
    ...npsIdentity(credential),
    MerchantTxnId: process.orderId,
  });
}
