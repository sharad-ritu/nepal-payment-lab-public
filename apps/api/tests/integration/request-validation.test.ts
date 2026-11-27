import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import type { Provider } from "@nepal-payment-lab/shared";
import {
  apiSuite,
  body,
  complete,
  credentials,
  esewaForm,
  gatewayForm,
  initiate,
  initiation,
  verification,
} from "./support";

afterEach(() => setSystemTime());

describe("provider request boundaries", () => {
  const api = apiSuite();

  test("Khalti distinguishes missing, malformed, and wrong credentials", async () => {
    const credential = await credentials(api(), { provider: "khalti" });
    const wrongSecret =
      credential.secret.slice(0, -1) +
      (credential.secret.endsWith("a") ? "b" : "a");
    for (const [authorization, detail] of [
      ["", "Authentication credentials were not provided."],
      ["Bearer invalid", "Authentication credentials were not provided."],
      ["Key invalid", "Invalid token."],
      [`Key ${credential.secret.slice(0, -1)}!`, "Invalid token."],
      [`Key ${wrongSecret}`, "Invalid token."],
    ] satisfies [string, string][]) {
      const response = await api().request("/khalti/api/v2/epayment/lookup/", {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pidx: "unknown" }),
      });
      expect(response.status).toBe(401);
      expect(await body(response)).toEqual({ detail, status_code: 401 });
    }
  });

  test("Khalti preserves method, media-type, and malformed-JSON errors", async () => {
    const credential = await credentials(api(), { provider: "khalti" });
    const headers = { Authorization: `kEy ${credential.secret}` };
    const method = await api().request("/khalti/api/v2/epayment/lookup/", {
      headers,
    });
    expect(method.status).toBe(405);
    expect(method.headers.get("Allow")).toBe("POST");
    expect(await body(method)).toEqual({ detail: 'Method "GET" not allowed.' });
    const media = await api().request("/khalti/api/v2/epayment/lookup/", {
      method: "POST",
      headers,
      body: "plain text",
    });
    expect(media.status).toBe(415);
    expect(await body(media)).toEqual({ detail: "Unsupported media type." });
    const malformed = await api().request("/khalti/api/v2/epayment/lookup/", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: "{",
    });
    expect(malformed.status).toBe(400);
    expect(await body(malformed)).toEqual({
      detail: "JSON parse error.",
      error_key: "validation_error",
    });
  });

  test.each(["validatetxn", "gettxndetail"])(
    "connectIPS %s preserves method, media-type, JSON, and size errors",
    async (endpoint) => {
      const path = `/connectips/connectipswebws/api/creditor/${endpoint}`;
      const method = await api().request(path);
      expect(method.status).toBe(405);
      expect(method.headers.get("Allow")).toBe("POST");
      expect(await body(method)).toEqual({ detail: "Method not allowed." });

      const media = await api().request(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "plain text",
      });
      expect(media.status).toBe(415);
      expect(await body(media)).toEqual({ detail: "Unsupported media type." });

      const malformed = await api().request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      });
      expect(malformed.status).toBe(400);
      expect(await body(malformed)).toEqual({
        status: "ERROR",
        statusDesc: "Invalid request.",
      });

      const oversized = await api().request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceId: "a".repeat(17000) }),
      });
      expect(oversized.status).toBe(413);
      expect(oversized.headers.get("Cache-Control")).toBe("no-store");
      expect(await body(oversized)).toEqual({
        detail: "Request body exceeds 16 KB.",
      });
    },
  );

  test.each(["esewa", "connectips"] satisfies Provider[])(
    "%s rejects oversized gateway forms without consuming the order ID",
    async (provider) => {
      const credential = await credentials(api(), { provider });
      const path =
        provider === "esewa"
          ? "/esewa/api/epay/main/v2/form"
          : "/connectips/connectipswebgw/loginpage";
      const form =
        provider === "esewa"
          ? esewaForm(credential, "ORDER-001")
          : gatewayForm(credential, "ORDER-001");
      const oversized = await api().request(path, {
        method: "POST",
        body: new URLSearchParams({
          ...form,
          padding: "a".repeat(17000),
        }),
      });

      expect(oversized.status).toBe(413);
      expect(await body(oversized)).toEqual({
        detail: "Request body exceeds 16 KB.",
      });
      await initiate(api(), {
        provider,
        credential,
        orderId: "ORDER-001",
      });
    },
  );

  test("Khalti rejects amount breakdown mismatch and unsafe return URLs", async () => {
    const credential = await credentials(api(), { provider: "khalti" });
    for (const fields of [
      { amount: 99 },
      { amount: 1200.5 },
      { amount_breakdown: [{ label: "Subtotal", amount: 1 }] },
      { return_url: "https://user:password@example.com" },
    ]) {
      const response = await api().request(
        "/khalti/api/v2/epayment/initiate/",
        {
          method: "POST",
          headers: {
            Authorization: `Key ${credential.secret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            return_url: "http://localhost:4100/return",
            website_url: "http://localhost:4100",
            amount: 120000,
            purchase_order_id: "ORDER-001",
            purchase_order_name: "Test order",
            ...fields,
          }),
        },
      );
      expect(response.status).toBe(400);
      expect((await body(response)).error_key).toBe("validation_error");
    }
  });

  test("eSewa rejects tampered signatures while accepting exact decimal text", async () => {
    const credential = await credentials(api(), { provider: "esewa" });
    const form = esewaForm(credential, "DECIMAL-001", {
      amount: "1200.50",
      total_amount: "1200.50",
    });
    const bad = await api().request("/esewa/api/epay/main/v2/form", {
      method: "POST",
      body: new URLSearchParams({ ...form, signature: "invalid" }),
    });
    expect(bad.status).toBe(400);
    expect(await body(bad)).toEqual({
      code: "ES104",
      message: "Invalid payload signature.",
    });
    const good = await api().request("/esewa/api/epay/main/v2/form", {
      method: "POST",
      body: new URLSearchParams(form),
    });
    expect(good.status).toBe(302);
    const location = good.headers.get("Location");
    if (!location) throw new Error("Checkout URL missing.");
    const token = new URL(location).pathname.split("/").at(-1);
    const checkout = await body(await api().request(`/v1/checkout/${token}`));
    expect(checkout.amountMinor).toBe(120050);
  });

  test.each(["success_url", "failure_url"])(
    "eSewa rejects malformed %s without reserving the transaction UUID",
    async (field) => {
      const credential = await credentials(api(), { provider: "esewa" });
      const orderId = "URL-001";
      for (const url of [
        "not a url",
        "http://[invalid]/return",
        "https://user:password@merchant.test/return",
      ]) {
        const response = await api().request("/esewa/api/epay/main/v2/form", {
          method: "POST",
          body: new URLSearchParams(
            esewaForm(credential, orderId, { [field]: url }),
          ),
        });

        expect(response.status).toBe(400);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(await body(response)).toEqual({
          error_key: "validation_error",
          [field]: ["Use an HTTP or HTTPS URL without embedded credentials."],
        });
      }
      await initiate(api(), { provider: "esewa", credential, orderId });
    },
  );

  test("connectIPS validates Basic authentication and account/body identifiers", async () => {
    const credential = await credentials(api(), { provider: "connectips" });
    const payment = await initiate(api(), {
      provider: "connectips",
      credential,
    });
    await complete(api(), payment);
    const form = gatewayForm(credential, payment.orderId);
    const data = {
      merchantId: form.MERCHANTID,
      appId: form.APPID,
      referenceId: payment.orderId,
      txnAmt: 120000,
      token: "synthetic-token",
    };
    for (const authorization of [
      "",
      "Basic invalid",
      `Basic ${Buffer.from(`${form.APPID}:wrong-password`).toString("base64")}`,
    ]) {
      const response = await api().request(
        "/connectips/connectipswebws/api/creditor/validatetxn",
        {
          method: "POST",
          headers: {
            Authorization: authorization,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        },
      );
      expect(response.status).toBe(401);
      expect(response.headers.get("Content-Type")).toBeNull();
      expect(await response.text()).toBe("HTTP Status 401 : Bad credentials\n");
    }
    const headers = {
      Authorization: `bAsIc ${Buffer.from(`${form.APPID}:${credential.secret}`).toString("base64")}`,
      "Content-Type": "application/json",
    };
    const valid = await api().request(
      "/connectips/connectipswebws/api/creditor/validatetxn",
      {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      },
    );
    expect((await body(valid)).status).toBe("SUCCESS");
    for (const changes of [{ merchantId: "999" }, { appId: "different-app" }]) {
      const response = await api().request(
        "/connectips/connectipswebws/api/creditor/validatetxn",
        {
          method: "POST",
          headers,
          body: JSON.stringify({ ...data, ...changes }),
        },
      );
      expect(await body(response)).toMatchObject({
        status: "ERROR",
        statusDesc: "TRANSACTION NOT FOUND",
      });
    }
    const missing = await api().request(
      "/connectips/connectipswebws/api/creditor/gettxndetail",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ ...data, referenceId: "MISSING-001" }),
      },
    );
    expect(missing.status).toBe(200);
    expect(await body(missing)).toEqual({
      status: "ERROR",
      statusDesc: "TRANSACTION NOT FOUND",
      merchantId: Number(form.MERCHANTID),
      appId: form.APPID,
      referenceId: null,
      txnAmt: null,
      token: null,
      debitBankCode: null,
      txnId: null,
      batchId: null,
      txnDate: null,
      txnCrncy: null,
      chargeAmt: null,
      chargeLiability: null,
      refId: "MISSING-001",
      remarks: null,
      particulars: null,
      creditStatus: null,
    });
  });

  test.each(["khalti", "esewa", "connectips"] satisfies Provider[])(
    "%s rejects unknown scenario headers instead of silently creating a checkout",
    async (provider) => {
      const credential = await credentials(api(), { provider });
      const response = await initiation(api(), {
        provider,
        credential,
        scenario: "unknown",
      });
      expect(response.status).toBe(400);
      expect(await body(response)).toEqual({
        detail: "Unknown Payment-Lab-Scenario.",
        error_key: "validation_error",
      });
      await initiate(api(), { provider, credential });
    },
  );

  test("oversized provider and checkout bodies use their own error contracts", async () => {
    const credential = await credentials(api(), { provider: "khalti" });
    const payment = await initiate(api(), { provider: "khalti", credential });
    const oversized = await api().request("/khalti/api/v2/epayment/lookup/", {
      method: "POST",
      headers: {
        Authorization: `Key ${credential.secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pidx: "a".repeat(17000) }),
    });
    expect(oversized.status).toBe(413);
    expect(await body(oversized)).toEqual({
      detail: "Request body exceeds 16 KB.",
    });
    const checkout = await api().request(
      `/v1/checkout/${payment.token}/simulate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioKey: "a".repeat(1100) }),
      },
    );
    expect(checkout.status).toBe(413);
    expect(await body(checkout)).toEqual({
      kind: "payload_too_large",
      message: "Request body is too large.",
    });
  });

  test("rate limits preserve provider errors, retry headers, and the minute boundary", async () => {
    const credential = await credentials(api(), { provider: "khalti" });
    const payment = {
      provider: "khalti",
      credential,
      orderId: "unknown",
      checkoutUrl: "",
      token: "",
      pidx: "unknown",
    } satisfies Parameters<typeof verification>[1];
    for (let index = 0; index < 60; index++) {
      expect((await verification(api(), payment)).status).toBe(404);
    }
    const limited = await verification(api(), payment);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await body(limited)).toEqual({ detail: "Request was throttled." });
    setSystemTime(new Date(Date.now() + 60001));
    expect((await verification(api(), payment)).status).toBe(404);
  });

  test("malformed and unknown checkout tokens do not consume a valid payment's quota", async () => {
    const credential = await credentials(api(), { provider: "khalti" });
    const payment = await initiate(api(), { provider: "khalti", credential });
    expect((await api().request("/v1/checkout/invalid")).status).toBe(404);

    for (let index = 0; index < 65; index++) {
      const unknownToken = String(index).padStart(43, "a");
      expect((await api().request(`/v1/checkout/${unknownToken}`)).status).toBe(
        404,
      );
    }

    expect((await api().request(`/v1/checkout/${payment.token}`)).status).toBe(
      200,
    );
    expect((await complete(api(), payment)).status).toBe(303);
  }, 15000);

  test("checkout throttling isolates payments sharing a peer address and resets after a minute", async () => {
    const credential = await credentials(api(), { provider: "khalti" });
    const first = await initiate(api(), {
      provider: "khalti",
      credential,
      orderId: "FIRST",
    });
    const second = await initiate(api(), {
      provider: "khalti",
      credential,
      orderId: "SECOND",
    });

    for (let index = 0; index < 60; index++) {
      expect((await api().request(`/v1/checkout/${first.token}`)).status).toBe(
        200,
      );
    }
    const limited = await api().request(`/v1/checkout/${first.token}`);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await body(limited)).toEqual({
      kind: "rate_limited",
      message: "Try again in a minute.",
    });
    expect((await complete(api(), first)).status).toBe(429);

    expect((await api().request(`/v1/checkout/${second.token}`)).status).toBe(
      200,
    );
    expect((await complete(api(), second)).status).toBe(303);

    setSystemTime(new Date(Date.now() + 60001));
    expect((await complete(api(), first)).status).toBe(303);
  }, 15000);
});
