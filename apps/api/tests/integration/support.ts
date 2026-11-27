import { afterEach, beforeEach, expect } from "bun:test";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import {
  connectipsMerchantId,
  credentialResponseSchema,
  type InitiationMode,
  type Provider,
  type ScenarioKey,
} from "@nepal-payment-lab/shared";
import { z } from "zod";
import { openTestDatabase } from "../../../../packages/database/tests/support/database";
import { createApp } from "../../src/app";

export type Credential = z.infer<typeof credentialResponseSchema>;

async function openApi() {
  const database = await openTestDatabase();
  const server = createServer(
    createApp({
      db: database.db,
      webOrigin: "http://checkout.test",
    }),
  );
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Test API did not bind a TCP port.");
    const origin = `http://127.0.0.1:${address.port}`;
    return {
      request: (path: string, init: RequestInit = {}) =>
        fetch(new URL(path, origin), {
          ...init,
          redirect: "manual",
          signal: AbortSignal.timeout(5000),
        }),
      close: async () => {
        try {
          await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
            server.closeAllConnections();
          });
        } finally {
          await database.close();
        }
      },
    };
  } catch (error) {
    server.closeAllConnections();
    server.close();
    await database.close();
    throw error;
  }
}

export type Api = Awaited<ReturnType<typeof openApi>>;

export function apiSuite() {
  let context: Api | undefined;
  beforeEach(async () => {
    context = await openApi();
  }, 15000);
  afterEach(async () => {
    if (context) await context.close();
    context = undefined;
  }, 15000);
  return () => {
    if (!context) throw new Error("Test API is not initialized.");
    return context;
  };
}

export function dashboard(
  api: Api,
  {
    provider,
    method = "GET",
    body,
  }: {
    provider: Provider;
    method?: string;
    body?: unknown;
  },
  suffix = "",
) {
  return api.request(`/v1/providers/${provider}${suffix}`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

// The URLs a merchant would register with NCHL during onboarding.
export const connectipsUrls = {
  successUrl: "http://merchant.test/success?existing=keep",
  failureUrl: "http://merchant.test/failure?existing=keep",
};

export async function credentials(
  api: Api,
  {
    provider,
    replace = false,
    registerUrls = true,
  }: {
    provider: Provider;
    replace?: boolean;
    registerUrls?: boolean;
  },
) {
  const response = await dashboard(
    api,
    {
      provider,
      method: "POST",
      body: { replace },
    },
    "/credentials",
  );
  expect(response.status).toBe(201);
  const credential = credentialResponseSchema.parse(await response.json());

  if (provider === "connectips" && registerUrls) {
    const registered = await dashboard(api, {
      provider,
      method: "PATCH",
      body: connectipsUrls,
    });
    expect(registered.status).toBe(200);
  }

  return credential;
}

export async function setMode(
  api: Api,
  {
    provider,
    mode,
  }: {
    provider: Provider;
    mode: InitiationMode;
  },
) {
  const response = await dashboard(api, {
    provider,
    method: "PATCH",
    body: { initiationMode: mode },
  });
  expect(response.status).toBe(200);
}

export function esewaForm(
  credential: Credential,
  orderId: string,
  overrides: Record<string, string> = {},
) {
  const form = {
    amount: "1200",
    tax_amount: "0",
    total_amount: "1200",
    transaction_uuid: orderId,
    product_code: credential.key.prefix,
    product_service_charge: "0",
    product_delivery_charge: "0",
    success_url: "http://merchant.test/success?existing=keep",
    failure_url: "http://merchant.test/failure?existing=keep",
    signed_field_names: "total_amount,transaction_uuid,product_code",
    ...overrides,
  };
  // Merchant-side implementation is independent of the lab payload helper.
  const message =
    "total_amount=" +
    form.total_amount +
    ",transaction_uuid=" +
    form.transaction_uuid +
    ",product_code=" +
    form.product_code;
  const signature = createHmac("sha256", credential.secret)
    .update(message)
    .digest("base64");
  return { ...form, signature };
}

export function gatewayForm(
  credential: Credential,
  orderId: string,
  overrides: Record<string, string> = {},
) {
  return {
    MERCHANTID: connectipsMerchantId(credential.key.prefix),
    APPID: credential.key.prefix,
    APPNAME: "Test merchant",
    TXNID: orderId,
    TXNDATE: "02-10-2026",
    TXNCRNCY: "NPR",
    TXNAMT: "120000",
    REFERENCEID: "REF-001",
    REMARKS: "Local test",
    PARTICULARS: "Test payment",
    TOKEN: "synthetic-rsa-token",
    ...overrides,
  };
}

export function initiation(
  api: Api,
  {
    provider,
    credential,
    orderId = "ORDER-001",
    scenario = "normal-completion",
  }: {
    provider: Exclude<Provider, "nps">;
    credential: Credential;
    orderId?: string;
    scenario?: string;
  },
) {
  if (provider === "khalti") {
    return api.request("/khalti/api/v2/epayment/initiate/", {
      method: "POST",
      headers: {
        Authorization: `Key ${credential.secret}`,
        "Content-Type": "application/json",
        "Payment-Lab-Scenario": scenario,
      },
      body: JSON.stringify({
        return_url: "http://merchant.test/success?existing=keep",
        website_url: "http://merchant.test",
        amount: 120000,
        purchase_order_id: orderId,
        purchase_order_name: "Test order",
      }),
    });
  }
  return api.request(
    provider === "esewa"
      ? "/esewa/api/epay/main/v2/form"
      : "/connectips/connectipswebgw/loginpage",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Payment-Lab-Scenario": scenario,
      },
      body: new URLSearchParams(
        provider === "esewa"
          ? esewaForm(credential, orderId)
          : gatewayForm(credential, orderId),
      ),
    },
  );
}

export async function initiate(
  api: Api,
  input: Parameters<typeof initiation>[1],
) {
  const response = await initiation(api, input);
  expect(response.status).toBe(
    input.provider === "khalti" ? 200 : input.provider === "esewa" ? 302 : 303,
  );
  let checkoutUrl: string;
  let pidx: string | null = null;
  if (input.provider === "khalti") {
    const body = z
      .object({
        pidx: z.string(),
        payment_url: z.url(),
        expires_at: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+05:45$/),
        expires_in: z.literal(1800),
      })
      .strict()
      .parse(await response.json());
    checkoutUrl = body.payment_url;
    pidx = body.pidx;
  } else {
    const location = response.headers.get("Location");
    if (!location)
      throw new Error("Form initiation did not return a checkout URL.");
    checkoutUrl = location;
  }
  const token = new URL(checkoutUrl).pathname.split("/").at(-1);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new Error("Checkout token has an invalid format.");
  return {
    provider: input.provider,
    credential: input.credential,
    orderId: input.orderId ?? "ORDER-001",
    checkoutUrl,
    token,
    pidx,
  };
}

export type Payment = Awaited<ReturnType<typeof initiate>>;

export function complete(
  api: Api,
  payment: Pick<Payment, "token">,
  scenario: ScenarioKey = "normal-completion",
) {
  return api.request(`/v1/checkout/${payment.token}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenarioKey: scenario }),
  });
}

export function verification(
  api: Api,
  payment: Payment,
  {
    credential = payment.credential,
    amount = "120000",
    details = false,
  }: {
    credential?: Credential;
    amount?: string;
    details?: boolean;
  } = {},
) {
  if (payment.provider === "esewa") {
    return api.request(
      "/esewa/api/epay/transaction/status/?" +
        new URLSearchParams({
          product_code: credential.key.prefix,
          transaction_uuid: payment.orderId,
          total_amount:
            amount === "120000" ? "1200" : String(Number(amount) / 100),
        }),
    );
  }
  return api.request(
    payment.provider === "khalti"
      ? "/khalti/api/v2/epayment/lookup/"
      : "/connectips/connectipswebws/api/creditor/" +
          (details ? "gettxndetail" : "validatetxn"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          payment.provider === "khalti"
            ? `Key ${credential.secret}`
            : "Basic " +
              Buffer.from(
                `${credential.key.prefix}:${credential.secret}`,
              ).toString("base64"),
      },
      body: JSON.stringify(
        payment.provider === "khalti"
          ? { pidx: payment.pidx }
          : {
              merchantId: Number(connectipsMerchantId(credential.key.prefix)),
              appId: credential.key.prefix,
              referenceId: payment.orderId,
              txnAmt: amount,
              token: "synthetic-rsa-token",
            },
      ),
    },
  );
}

export async function body(response: Response) {
  return z.record(z.string(), z.unknown()).parse(await response.json());
}
