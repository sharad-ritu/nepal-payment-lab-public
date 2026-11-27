import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { createHmac } from "node:crypto";
import { npsIdentity, npsRequest, signedNps } from "./nps-support";
import { apiSuite, body, credentials, dashboard } from "./support";

describe("NPS authentication and validation", () => {
  const api = apiSuite();
  afterEach(() => setSystemTime());

  test("throttled NPS responses retain the provider envelope and retry header", async () => {
    const credential = await credentials(api(), { provider: "nps" });
    for (let index = 0; index < 120; index++) {
      expect(
        (
          await npsRequest(
            api(),
            credential,
            "GetPaymentInstrumentDetails",
            npsIdentity(credential),
          )
        ).status,
      ).toBe(200);
    }
    const limited = await npsRequest(
      api(),
      credential,
      "GetPaymentInstrumentDetails",
      npsIdentity(credential),
    );
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await body(limited)).toEqual({
      code: "1",
      message: "Error",
      errors: [{ error_code: "1", error_message: "Request was throttled." }],
      data: null,
    });
    setSystemTime(new Date(Date.now() + 60001));
    expect(
      (
        await npsRequest(
          api(),
          credential,
          "GetPaymentInstrumentDetails",
          npsIdentity(credential),
        )
      ).status,
    ).toBe(200);
  }, 15000);
  test("signed APIs reject missing, wrong, and cross-provider credentials", async () => {
    const credential = await credentials(api(), { provider: "nps" });
    const otherProvider = await credentials(api(), { provider: "esewa" });
    for (const authorization of [
      "",
      "Bearer invalid",
      "Basic invalid",
      `Basic ${Buffer.from(`${credential.key.prefix}:wrong-password`).toString("base64")}`,
      `Basic ${Buffer.from(`${otherProvider.key.prefix}:${otherProvider.secret}`).toString("base64")}`,
    ]) {
      const response = await api().request("/nps/GetPaymentInstrumentDetails", {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(signedNps(credential, npsIdentity(credential))),
      });
      expect(response.status).toBe(401);
      expect(await body(response)).toEqual({
        code: "1",
        message: "Error",
        errors: [{ error_code: "1", error_message: "Invalid credentials." }],
        data: null,
      });
    }
  });

  test("accepts case-insensitive Basic authentication but requires valid merchant identity and raw-value signatures", async () => {
    const credential = await credentials(api(), { provider: "nps" });
    const identity = npsIdentity(credential);
    const headers = {
      Authorization: `bAsIc ${Buffer.from(`${credential.key.prefix}:${credential.secret}`).toString("base64")}`,
      "Content-Type": "application/json",
    };
    const valid = await api().request("/nps/GetPaymentInstrumentDetails", {
      method: "POST",
      headers,
      body: JSON.stringify(signedNps(credential, identity)),
    });
    expect((await body(valid)).code).toBe("0");
    for (const values of [
      { ...identity, MerchantId: "999" },
      { ...identity, MerchantName: "wrong" },
    ]) {
      const response = await npsRequest(
        api(),
        credential,
        "GetPaymentInstrumentDetails",
        values,
      );
      expect(response.status).toBe(400);
      expect(await body(response)).toMatchObject({
        code: "1",
        errors: [{ error_message: "Invalid merchant details." }],
      });
    }
    const values = { ...identity, Amount: "100.00", InstrumentCode: "TMBANK" };
    for (const input of [
      { ...signedNps(credential, values), Amount: "100" },
      {
        ...values,
        Signature: createHmac("sha512", credential.secret)
          .update(
            values.MerchantName +
              values.MerchantId +
              values.Amount +
              values.InstrumentCode,
          )
          .digest("hex"),
      },
      { ...values, Signature: "a".repeat(128) },
    ]) {
      const response = await api().request("/nps/GetServiceCharge", {
        method: "POST",
        headers,
        body: JSON.stringify(input),
      });
      expect(response.status).toBe(400);
      expect(await body(response)).toMatchObject({
        code: "1",
        errors: [{ error_message: "Invalid signature." }],
      });
    }
  });
  test("method, media, JSON, and size errors stay in the NPS envelope", async () => {
    const method = await api().request("/nps/GetProcessId");
    expect(method.status).toBe(405);
    expect(method.headers.get("Allow")).toBe("POST");
    const media = await api().request("/nps/GetProcessId", {
      method: "POST",
      body: "plain",
    });
    expect(media.status).toBe(415);
    const json = await api().request("/nps/GetProcessId", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(json.status).toBe(400);
    expect(await body(json)).toMatchObject({
      code: "1",
      errors: [{ error_message: "JSON parse error." }],
    });
    const oversized = await api().request("/nps/Payment/Index", {
      method: "POST",
      body: new URLSearchParams({ ProcessId: "a".repeat(17000) }),
    });
    expect(oversized.status).toBe(413);
    expect(await body(oversized)).toMatchObject({
      code: "1",
      errors: [{ error_message: "Request body exceeds 16 KB." }],
    });
    const multipart = await api().request("/nps/Payment/Index", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=invalid" },
      body: "malformed",
    });
    expect(multipart.status).toBe(400);
  });
  test("response URL settings reject unsafe URLs and removed notification settings", async () => {
    await credentials(api(), { provider: "nps" });
    for (const url of [
      "file:///tmp/return",
      "https://user:password@example.com/return",
      "javascript:alert(1)",
    ]) {
      expect(
        (
          await dashboard(api(), {
            provider: "nps",
            method: "PATCH",
            body: {
              initiationMode: "allow",
              responseUrl: url,
            },
          })
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await dashboard(api(), {
          provider: "nps",
          method: "PATCH",
          body: { notificationUrl: "http://merchant.test/notify" },
        })
      ).status,
    ).toBe(400);
    await credentials(api(), { provider: "khalti" });
    expect(
      (
        await dashboard(api(), {
          provider: "khalti",
          method: "PATCH",
          body: {
            initiationMode: "allow",
            responseUrl: "http://merchant.test/return",
          },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await dashboard(api(), {
          provider: "nps",
          method: "PATCH",
          body: {
            initiationMode: "allow",
            responseUrl: "http://merchant.test/return",
          },
        })
      ).status,
    ).toBe(200);
  });
});
