import { createHmac } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import {
  connectipsMerchantId,
  credentialResponseSchema,
  npsMerchantId,
  type Provider,
} from "../packages/shared/src";

export const apiOrigin = process.env.E2E_API_URL ?? "http://localhost:45174";
export const webOrigin = process.env.E2E_WEB_URL ?? "http://localhost:45173";

export type Credential = ReturnType<typeof credentialResponseSchema.parse>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function seedProvider(page: Page, provider: Provider = "khalti") {
  await page.goto(`/dashboard?provider=${provider}`);
  await expect(
    page.getByRole("heading", { name: "Connect your app", exact: true }),
  ).toBeVisible();
  const issued = await page.request.post(
    `/api/lab/providers/${provider}/credentials`,
    {
      headers: { Origin: webOrigin },
      data: { replace: true },
    },
  );
  expect(issued.status()).toBe(201);
  const credential = credentialResponseSchema.parse(await issued.json());
  const mode = await page.request.patch(`/api/lab/providers/${provider}`, {
    headers: { Origin: webOrigin },
    data: {
      initiationMode: "allow",
      ...(provider === "nps"
        ? {
            responseUrl: "http://merchant.test/return",
          }
        : {}),
      ...(provider === "connectips"
        ? {
            successUrl: "http://merchant.test/return",
            failureUrl: "http://merchant-failure.test/return",
          }
        : {}),
    },
  });
  expect(mode.status()).toBe(200);
  return credential;
}

export async function createPayment(
  page: Page,
  provider: Provider,
  credential: Credential,
  scenario = "normal-completion",
) {
  const orderId = `E2E-${crypto.randomUUID().slice(0, 12)}`;
  let checkoutUrl: string;
  let pidx: string | null = null;
  if (provider === "nps") {
    const values: Record<string, string> = {
      MerchantId: npsMerchantId(credential.key.prefix),
      MerchantName: credential.key.prefix,
      Amount: "1200",
      MerchantTxnId: orderId,
    };
    const Signature = createHmac("sha512", credential.secret)
      .update(
        Object.keys(values)
          .sort()
          .map((key) => values[key])
          .join(""),
      )
      .digest("hex");
    const response = await page.request.post(`${apiOrigin}/nps/GetProcessId`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${credential.key.prefix}:${credential.secret}`).toString("base64")}`,
        "Payment-Lab-Scenario": scenario,
      },
      data: { ...values, Signature },
    });
    expect(response.status()).toBe(200);
    const result: unknown = await response.json();
    if (
      !isRecord(result) ||
      result.code !== "0" ||
      !isRecord(result.data) ||
      typeof result.data.ProcessId !== "string"
    ) {
      throw new Error("NPS did not return a process ID.");
    }
    pidx = result.data.ProcessId;
    const gateway = await page.request.post(`${apiOrigin}/nps/Payment/Index`, {
      maxRedirects: 0,
      multipart: {
        ...values,
        ProcessId: pidx,
        InstrumentCode: "TMBANK",
        TransactionRemarks: "Browser test",
      },
    });
    expect(gateway.status()).toBe(303);
    const location = gateway.headers().location;
    if (!location) throw new Error("NPS did not return checkout.");
    checkoutUrl = location;
  } else if (provider === "khalti") {
    const response = await page.request.post(
      `${apiOrigin}/khalti/api/v2/epayment/initiate/`,
      {
        headers: {
          Authorization: `Key ${credential.secret}`,
          "Payment-Lab-Scenario": scenario,
        },
        data: {
          return_url: "http://merchant.test/return",
          website_url: "http://merchant.test",
          amount: 120000,
          purchase_order_id: orderId,
          purchase_order_name: "Browser test order",
        },
      },
    );
    expect(response.status()).toBe(200);
    const data: unknown = await response.json();
    if (
      !isRecord(data) ||
      typeof data.pidx !== "string" ||
      typeof data.payment_url !== "string"
    ) {
      throw new Error(
        "Khalti initiation did not return a payment ID and checkout URL.",
      );
    }
    pidx = data.pidx;
    checkoutUrl = data.payment_url;
  } else {
    const signature = createHmac("sha256", credential.secret)
      .update(
        `total_amount=1200,transaction_uuid=${orderId},product_code=${credential.key.prefix}`,
      )
      .digest("base64");
    const response = await page.request.post(
      apiOrigin +
        (provider === "esewa"
          ? "/esewa/api/epay/main/v2/form"
          : "/connectips/connectipswebgw/loginpage"),
      {
        maxRedirects: 0,
        headers: { "Payment-Lab-Scenario": scenario },
        form:
          provider === "esewa"
            ? {
                amount: "1200",
                tax_amount: "0",
                total_amount: "1200",
                transaction_uuid: orderId,
                product_code: credential.key.prefix,
                product_service_charge: "0",
                product_delivery_charge: "0",
                success_url: "http://merchant.test/return",
                failure_url: "http://merchant-failure.test/return",
                signed_field_names:
                  "total_amount,transaction_uuid,product_code",
                signature,
              }
            : {
                MERCHANTID: connectipsMerchantId(credential.key.prefix),
                APPID: credential.key.prefix,
                APPNAME: "Browser test merchant",
                TXNID: orderId,
                TXNDATE: "02-10-2026",
                TXNCRNCY: "NPR",
                TXNAMT: "120000",
                REFERENCEID: "REF-001",
                REMARKS: "Browser test",
                PARTICULARS: "Test payment",
                TOKEN: "synthetic-token",
              },
      },
    );
    expect(response.status()).toBe(provider === "esewa" ? 302 : 303);
    const location = response.headers().location;
    if (!location) throw new Error("Provider did not return a checkout URL.");
    checkoutUrl = location;
  }
  return { provider, credential, orderId, pidx, checkoutUrl };
}

export async function verifyPayment(
  page: Page,
  payment: Awaited<ReturnType<typeof createPayment>>,
) {
  let data: unknown;
  if (payment.provider === "nps") {
    const values: Record<string, string> = {
      MerchantId: npsMerchantId(payment.credential.key.prefix),
      MerchantName: payment.credential.key.prefix,
      MerchantTxnId: payment.orderId,
    };
    const Signature = createHmac("sha512", payment.credential.secret)
      .update(
        Object.keys(values)
          .sort()
          .map((key) => values[key])
          .join(""),
      )
      .digest("hex");
    const response = await page.request.post(
      `${apiOrigin}/nps/CheckTransactionStatus`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${payment.credential.key.prefix}:${payment.credential.secret}`).toString("base64")}`,
        },
        data: { ...values, Signature },
      },
    );
    expect(response.status()).toBe(200);
    data = await response.json();
  } else if (payment.provider === "khalti") {
    const response = await page.request.post(
      `${apiOrigin}/khalti/api/v2/epayment/lookup/`,
      {
        headers: { Authorization: `Key ${payment.credential.secret}` },
        data: { pidx: payment.pidx },
      },
    );
    expect(response.status()).toBe(200);
    data = await response.json();
  } else if (payment.provider === "esewa") {
    const response = await page.request.get(
      `${apiOrigin}/esewa/api/epay/transaction/status/`,
      {
        params: {
          product_code: payment.credential.key.prefix,
          total_amount: "1200",
          transaction_uuid: payment.orderId,
        },
      },
    );
    expect(response.status()).toBe(200);
    data = await response.json();
  } else {
    const response = await page.request.post(
      `${apiOrigin}/connectips/connectipswebws/api/creditor/validatetxn`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${payment.credential.key.prefix}:${payment.credential.secret}`).toString("base64")}`,
        },
        data: {
          merchantId: connectipsMerchantId(payment.credential.key.prefix),
          appId: payment.credential.key.prefix,
          referenceId: payment.orderId,
          txnAmt: 120000,
          token: "synthetic-token",
        },
      },
    );
    expect(response.status()).toBe(200);
    data = await response.json();
  }
  if (!isRecord(data))
    throw new Error("Verification did not return a JSON object.");
  return data;
}

export async function merchantReturn(page: Page) {
  await page.route(
    /^http:\/\/merchant(?:-failure)?\.test\/return(?:\?|$)/,
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Merchant return</title><h1>Merchant return</h1>",
      }),
  );
  await page.route(`${webOrigin}/checkout/*/simulate`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    // Playwright only routes the first request in a server redirect chain.
    // Submit the real form, then make the merchant return a fresh navigation.
    const response = await route.fetch({ maxRedirects: 0 });
    expect(response.status()).toBe(303);
    const headers = response.headers();
    expect(headers["cache-control"]).toBe("no-store");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    const location = headers.location;
    if (!location) throw new Error("Checkout did not return a merchant URL.");
    const destination = new URL(location);
    expect(`${destination.origin}${destination.pathname}`).toMatch(
      /^http:\/\/merchant(?:-failure)?\.test\/return$/,
    );

    await route.fulfill({
      status: 200,
      contentType: "text/html",
      headers: { "Referrer-Policy": "no-referrer" },
      body: `<!doctype html><script>window.location.replace(${JSON.stringify(location).replace(/</g, "\\u003c")})</script>`,
    });
  });
}

export async function replaceKey(page: Page) {
  await page.getByRole("button", { name: "Replace key", exact: true }).click();
  const response = page.waitForResponse(
    (entry) =>
      entry.url().endsWith("/api/lab/providers/khalti/credentials") &&
      entry.request().method() === "POST",
  );
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Replace key", exact: true })
    .click();
  return credentialResponseSchema.parse(await (await response).json());
}
