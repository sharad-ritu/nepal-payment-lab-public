import { describe, expect, test } from "bun:test";
import type { Provider, ScenarioKey } from "@nepal-payment-lab/shared";
import { z } from "zod";
import {
  apiSuite,
  body,
  complete,
  connectipsUrls,
  credentials,
  dashboard,
  gatewayForm,
  initiate,
  initiation,
  setMode,
} from "./support";

function location(response: Response) {
  return new URL(z.string().parse(response.headers.get("Location")));
}

describe("registered merchant URLs", () => {
  const api = apiSuite();

  test("connectIPS rejects gateway forms until both URLs are registered", async () => {
    const credential = await credentials(api(), {
      provider: "connectips",
      registerUrls: false,
    });
    const expected = {
      detail:
        "Register a Success URL and Failure URL in the connectIPS dashboard before posting the gateway form.",
      error_key: "validation_error",
    };

    const unregistered = await initiation(api(), {
      provider: "connectips",
      credential,
    });
    expect(unregistered.status).toBe(400);
    expect(await body(unregistered)).toEqual(expected);

    const partial = await dashboard(api(), {
      provider: "connectips",
      method: "PATCH",
      body: { successUrl: connectipsUrls.successUrl },
    });
    expect(partial.status).toBe(200);
    const incomplete = await initiation(api(), {
      provider: "connectips",
      credential,
    });
    expect(incomplete.status).toBe(400);
    expect(await body(incomplete)).toEqual(expected);

    const registered = await dashboard(api(), {
      provider: "connectips",
      method: "PATCH",
      body: { failureUrl: connectipsUrls.failureUrl },
    });
    expect(registered.status).toBe(200);
    await initiate(api(), {
      provider: "connectips",
      credential,
    });
  });

  test("connectIPS initiation failures apply before URL registration is checked", async () => {
    const credential = await credentials(api(), {
      provider: "connectips",
      registerUrls: false,
    });
    await setMode(api(), {
      provider: "connectips",
      mode: "server-error",
    });
    const response = await initiation(api(), {
      provider: "connectips",
      credential,
    });
    expect(response.status).toBe(500);
    expect(await body(response)).toEqual({ detail: "Internal server error." });
  });

  test("connectIPS returns to registered URLs and ignores form return fields", async () => {
    const credential = await credentials(api(), { provider: "connectips" });
    const form = await api().request("/connectips/connectipswebgw/loginpage", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(
        gatewayForm(credential, "ORDER-001", {
          SUCCESSURL: "http://form-success.test/return",
          FAILUREURL: "http://form-failure.test/return",
        }),
      ),
    });
    expect(form.status).toBe(303);
    const token = location(form).pathname.split("/").at(-1);
    if (!token) throw new Error("Gateway form did not open checkout.");

    const checkout = await body(await api().request(`/v1/checkout/${token}`));
    expect(checkout).toMatchObject({
      returnHost: "merchant.test",
      failureHost: "merchant.test",
    });

    const success = location(await complete(api(), { token }));
    expect(`${success.origin}${success.pathname}`).toBe(
      "http://merchant.test/success",
    );
    expect(Object.fromEntries(success.searchParams)).toEqual({
      existing: "keep",
      TXNID: "ORDER-001",
    });

    const canceled = await initiate(api(), {
      provider: "connectips",
      credential,
      orderId: "ORDER-002",
    });
    const failure = location(
      await complete(api(), canceled, "user-cancellation"),
    );
    expect(`${failure.origin}${failure.pathname}`).toBe(
      "http://merchant.test/failure",
    );
    expect(failure.searchParams.get("TXNID")).toBe("ORDER-002");
  });

  test.each(["normal-completion", "user-cancellation"] satisfies ScenarioKey[])(
    "connectIPS %s keeps the URLs registered when the payment was created",
    async (scenario) => {
      const credential = await credentials(api(), { provider: "connectips" });
      const payment = await initiate(api(), {
        provider: "connectips",
        credential,
      });
      const changed = await dashboard(api(), {
        provider: "connectips",
        method: "PATCH",
        body: {
          successUrl: "http://new-merchant.test/success",
          failureUrl: "http://new-merchant.test/failure",
        },
      });
      expect(changed.status).toBe(200);

      const original = location(await complete(api(), payment, scenario));
      expect(`${original.origin}${original.pathname}`).toBe(
        scenario === "normal-completion"
          ? "http://merchant.test/success"
          : "http://merchant.test/failure",
      );
      expect(Object.fromEntries(original.searchParams)).toEqual({
        existing: "keep",
        TXNID: "ORDER-001",
      });

      const next = await initiate(api(), {
        provider: "connectips",
        credential,
        orderId: "ORDER-002",
      });
      const updated = location(await complete(api(), next, scenario));
      expect(`${updated.origin}${updated.pathname}`).toBe(
        scenario === "normal-completion"
          ? "http://new-merchant.test/success"
          : "http://new-merchant.test/failure",
      );
    },
  );

  test("URL updates keep the initiation response and are visible in the local workspace", async () => {
    await credentials(api(), {
      provider: "connectips",
      registerUrls: false,
    });
    await setMode(api(), {
      provider: "connectips",
      mode: "auth-error",
    });
    const saved = await dashboard(api(), {
      provider: "connectips",
      method: "PATCH",
      body: connectipsUrls,
    });
    expect(saved.status).toBe(200);
    expect(
      (await body(await dashboard(api(), { provider: "connectips" }))).account,
    ).toMatchObject({
      initiationMode: "auth-error",
      ...connectipsUrls,
    });

    const cleared = await dashboard(api(), {
      provider: "connectips",
      method: "PATCH",
      body: { failureUrl: null },
    });
    expect(cleared.status).toBe(200);
    expect(
      (await body(await dashboard(api(), { provider: "connectips" }))).account,
    ).toMatchObject({
      successUrl: connectipsUrls.successUrl,
      failureUrl: null,
    });
  });

  test.each([
    {
      provider: "connectips",
      settings: { responseUrl: "http://merchant.test/return" },
    },
    {
      provider: "nps",
      settings: { successUrl: "http://merchant.test/success" },
    },
    {
      provider: "khalti",
      settings: { failureUrl: "http://merchant.test/failure" },
    },
    {
      provider: "esewa",
      settings: { responseUrl: "http://merchant.test/return" },
    },
  ] satisfies { provider: Provider; settings: Record<string, string> }[])(
    "$provider rejects URLs registered for other providers",
    async ({ provider, settings }) => {
      await credentials(api(), {
        provider,
        registerUrls: false,
      });
      const response = await dashboard(api(), {
        provider,
        method: "PATCH",
        body: settings,
      });
      expect(response.status).toBe(400);
      expect(await body(response)).toEqual({
        kind: "invalid_request",
        message: "These URLs cannot be registered for this provider.",
      });
    },
  );

  test("registered URL settings reject unsafe and empty updates", async () => {
    await credentials(api(), {
      provider: "connectips",
      registerUrls: false,
    });
    for (const input of [
      { successUrl: "file:///tmp/success" },
      { failureUrl: "https://user:password@merchant.test/failure" },
      { successUrl: "javascript:alert(1)" },
      { successUrl: "not a url" },
      { failureUrl: "/payments/return" },
      {},
    ]) {
      const response = await dashboard(api(), {
        provider: "connectips",
        method: "PATCH",
        body: input,
      });
      expect(response.status).toBe(400);
      expect((await body(response)).kind).toBe("invalid_request");
    }
  });

  test.each([
    {
      provider: "connectips",
      urls: connectipsUrls,
    },
    {
      provider: "nps",
      urls: {
        responseUrl: "http://merchant.test/return",
      },
    },
  ] satisfies {
    provider: Provider;
    urls: Record<string, string>;
  }[])(
    "$provider rejects malformed URLs atomically for every registered field",
    async ({ provider, urls }) => {
      await credentials(api(), { provider, registerUrls: false });
      const saved = await dashboard(api(), {
        provider,
        method: "PATCH",
        body: urls,
      });
      expect(saved.status).toBe(200);

      for (const field of Object.keys(urls)) {
        for (const url of [
          "not a url",
          "http://[invalid]/return",
          "https://user:password@merchant.test/return",
        ]) {
          const rejected = await dashboard(api(), {
            provider,
            method: "PATCH",
            body: {
              ...Object.fromEntries(
                Object.keys(urls).map((key) => [
                  key,
                  "http://changed-merchant.test/return",
                ]),
              ),
              initiationMode: "server-error",
              [field]: url,
            },
          });
          expect(rejected.status).toBe(400);
          expect((await body(rejected)).kind).toBe("invalid_request");
          const current = await dashboard(api(), { provider });
          expect((await body(current)).account).toMatchObject({
            ...urls,
            initiationMode: "allow",
          });
        }
      }
    },
  );
});
