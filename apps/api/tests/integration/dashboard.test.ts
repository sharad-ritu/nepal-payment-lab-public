import { describe, expect, test } from "bun:test";
import {
  type Provider,
  providerResponseSchema,
} from "@nepal-payment-lab/shared";
import { apiSuite, body, credentials, dashboard, setMode } from "./support";

describe("local dashboard and credentials", () => {
  const api = apiSuite();

  test("dashboard routes work without a session", async () => {
    const response = await api().request("/v1/providers/khalti");
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ account: null, key: null });
  });

  test.each(["khalti", "esewa", "connectips", "nps"] satisfies Provider[])(
    "%s credentials and settings are shared by the local workspace",
    async (provider) => {
      const created = await credentials(api(), { provider });
      expect(created.secret).toMatch(
        /^lab_test_[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/,
      );
      expect(created.key.secret).toBe(created.secret);
      expect(Object.keys(created.account).sort()).toEqual([
        "createdAt",
        ...(provider === "connectips" ? ["failureUrl"] : []),
        "id",
        "initiationMode",
        "provider",
        ...(provider === "nps" ? ["responseUrl"] : []),
        ...(provider === "connectips" ? ["successUrl"] : []),
      ]);
      const own = providerResponseSchema.parse(
        await (await dashboard(api(), { provider })).json(),
      );
      expect(own.account?.id).toBe(created.account.id);
      expect(own.key?.secret).toBe(created.secret);
      const saved = await dashboard(api(), {
        provider,
        method: "PATCH",
        body: { initiationMode: "auth-error" },
      });
      expect(saved.status).toBe(200);
      expect(
        (await body(await dashboard(api(), { provider }))).account,
      ).toMatchObject({ initiationMode: "auth-error" });
    },
  );

  test("concurrent initial credential generation does not silently replace a key", async () => {
    const responses = await Promise.all([
      dashboard(
        api(),
        { provider: "khalti", method: "POST", body: { replace: false } },
        "/credentials",
      ),
      dashboard(
        api(),
        { provider: "khalti", method: "POST", body: { replace: false } },
        "/credentials",
      ),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const winner = responses.find((response) => response.status === 201);
    if (!winner) throw new Error("Credential generation had no winner.");
    const issued = await body(winner);
    const current = await body(await dashboard(api(), { provider: "khalti" }));
    expect(current.key).toMatchObject({ secret: issued.secret });
  });

  test("replacement and revocation preserve provider settings", async () => {
    const first = await credentials(api(), { provider: "esewa" });
    await setMode(api(), { provider: "esewa", mode: "server-error" });
    const replacement = await credentials(api(), {
      provider: "esewa",
      replace: true,
    });
    expect(replacement.secret).not.toBe(first.secret);
    expect(replacement.account.id).toBe(first.account.id);
    expect(replacement.account.initiationMode).toBe("server-error");
    const revoked = await dashboard(
      api(),
      { provider: "esewa", method: "DELETE" },
      "/credentials",
    );
    expect(revoked.status).toBe(204);
    const state = await body(await dashboard(api(), { provider: "esewa" }));
    expect(state.key).toBeNull();
    expect(state.account).toMatchObject({
      id: first.account.id,
      initiationMode: "server-error",
    });
    const repeated = await dashboard(
      api(),
      { provider: "esewa", method: "DELETE" },
      "/credentials",
    );
    expect(repeated.status).toBe(204);
  });

  test("revoking a provider leaves another provider's key active", async () => {
    const credential = await credentials(api(), { provider: "khalti" });
    await credentials(api(), { provider: "esewa" });
    const response = await dashboard(
      api(),
      { provider: "esewa", method: "DELETE" },
      "/credentials",
    );
    expect(response.status).toBe(204);
    const state = await body(await dashboard(api(), { provider: "khalti" }));
    expect(state.key).toMatchObject({ secret: credential.secret });
  });

  test("settings reject extra fields and unknown modes", async () => {
    await credentials(api(), { provider: "khalti" });
    for (const input of [
      { initiationMode: "allow", unexpected: true },
      { initiationMode: "unknown" },
    ]) {
      const response = await dashboard(api(), {
        provider: "khalti",
        method: "PATCH",
        body: input,
      });
      expect(response.status).toBe(400);
      expect((await body(response)).kind).toBe("invalid_request");
    }
  });

  test("unknown providers and malformed dashboard JSON return dashboard errors", async () => {
    const unknown = await api().request("/v1/providers/unknown");
    expect(unknown.status).toBe(404);
    const malformed = await api().request("/v1/providers/khalti", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{",
    });
    expect(malformed.status).toBe(400);
    expect(await body(malformed)).toEqual({
      kind: "invalid_json",
      message: "Send valid JSON.",
    });
  });
});
