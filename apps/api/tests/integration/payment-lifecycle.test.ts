import {
  afterEach,
  describe,
  expect,
  mock,
  setSystemTime,
  test,
} from "bun:test";
import { createHmac } from "node:crypto";
import type { InitiationMode, Provider } from "@nepal-payment-lab/shared";
import { z } from "zod";
import {
  apiSuite,
  body,
  complete,
  credentials,
  dashboard,
  initiate,
  initiation,
  setMode,
  verification,
} from "./support";
import { captureTimeout } from "./timeout";

afterEach(() => {
  setSystemTime();
  mock.restore();
});

describe.each(["khalti", "esewa", "connectips"] satisfies Provider[])(
  "%s payment lifecycle",
  (provider) => {
    const api = apiSuite();

    test.each([
      { mode: "validation-error", status: 400 },
      { mode: "auth-error", status: 401 },
      { mode: "server-error", status: 500 },
    ] satisfies { mode: InitiationMode; status: number }[])(
      "$mode rejects initiation without reserving a form transaction reference",
      async ({ mode, status }) => {
        const credential = await credentials(api(), { provider });
        await setMode(api(), { provider, mode });
        const response = await initiation(api(), {
          provider,
          credential,
          scenario: "normal-completion",
        });
        expect(response.status).toBe(status);
        expect(response.headers.get("Location")).toBeNull();
        const failure = await body(response);
        if (mode === "server-error")
          expect(failure).toEqual({ detail: "Internal server error." });
        else if (provider === "khalti")
          expect(failure).toEqual(
            mode === "auth-error"
              ? { detail: "Invalid token.", status_code: 401 }
              : {
                  amount: ["A valid integer is required."],
                  error_key: "validation_error",
                },
          );
        else
          expect(failure).toEqual({
            detail:
              mode === "auth-error"
                ? "Simulated initiation failure: authentication error."
                : "Simulated initiation failure: validation error.",
          });
        await setMode(api(), { provider, mode: "allow" });
        await initiate(api(), { provider, credential });
      },
    );

    test("initiation timeout closes the connection and creates no reserved reference", async () => {
      const credential = await credentials(api(), { provider });
      await setMode(api(), { provider, mode: "timeout" });
      const timeout = captureTimeout();
      const result = initiation(api(), { provider, credential }).then(
        () => "response",
        () => "closed",
      );
      await timeout.scheduled;
      timeout.expire();
      expect(await result).toBe("closed");
      await setMode(api(), { provider, mode: "allow" });
      await initiate(api(), { provider, credential });
    });

    test("verification timeout holds no credential lock and preserves the checkout snapshot", async () => {
      const credential = await credentials(api(), { provider });
      const payment = await initiate(api(), { provider, credential });
      await complete(api(), payment, "lookup-timeout");
      const timeout = captureTimeout();
      const result = verification(api(), payment).then(
        () => "response",
        () => "closed",
      );
      await timeout.scheduled;
      await credentials(api(), { provider, replace: true });
      timeout.expire();
      expect(await result).toBe("closed");
      expect(
        await body(await api().request(`/v1/checkout/${payment.token}`)),
      ).toMatchObject({
        used: true,
        scenarioKey: "lookup-timeout",
      });
    });

    test("concurrent checkout submissions save exactly one outcome", async () => {
      const credential = await credentials(api(), { provider });
      const payment = await initiate(api(), { provider, credential });
      const responses = await Promise.all([
        complete(api(), payment, "normal-completion"),
        complete(api(), payment, "user-cancellation"),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        303, 409,
      ]);
      const selected =
        responses[0]?.status === 303
          ? "normal-completion"
          : "user-cancellation";
      const checkout = await body(
        await api().request(`/v1/checkout/${payment.token}`),
      );
      expect(checkout).toMatchObject({ used: true, scenarioKey: selected });
      const result = await body(await verification(api(), payment));
      const success = selected === "normal-completion";
      expect(result.status).toBe(
        provider === "khalti"
          ? success
            ? "Completed"
            : "User canceled"
          : provider === "esewa"
            ? success
              ? "COMPLETE"
              : "CANCELED"
            : success
              ? "SUCCESS"
              : "FAILED",
      );
    });

    test("settings changes cannot alter an existing payment's saved outcome", async () => {
      const credential = await credentials(api(), { provider });
      const payment = await initiate(api(), {
        provider,
        credential,
        scenario: "pending-payment",
      });
      await complete(api(), payment, "normal-completion");
      await setMode(api(), { provider, mode: "server-error" });
      const result = await verification(api(), payment);
      expect(result.status).toBe(200);
      expect((await body(result)).status).toBe(
        provider === "khalti"
          ? "Completed"
          : provider === "esewa"
            ? "COMPLETE"
            : "SUCCESS",
      );
      expect(
        (
          await initiation(api(), {
            provider,
            credential,
            orderId: "ORDER-002",
          })
        ).status,
      ).toBe(500);
    });

    test("checkout rejects an invalid selection without consuming the token", async () => {
      const credential = await credentials(api(), { provider });
      const payment = await initiate(api(), { provider, credential });
      const rejected = await api().request(
        `/v1/checkout/${payment.token}/simulate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenarioKey: "unknown" }),
        },
      );
      expect(rejected.status).toBe(400);
      expect((await complete(api(), payment)).status).toBe(303);
    });

    test("an unused checkout expires exactly at its deadline", async () => {
      const credential = await credentials(api(), { provider });
      const payment = await initiate(api(), { provider, credential });
      const data = await body(
        await api().request(`/v1/checkout/${payment.token}`),
      );
      setSystemTime(new Date(z.string().parse(data.expiresAt)));
      expect((await complete(api(), payment)).status).toBe(409);
      const result = await verification(api(), payment);
      expect(result.status).toBe(provider === "khalti" ? 400 : 200);
      expect((await body(result)).status).toBe(
        provider === "khalti"
          ? "Expired"
          : provider === "esewa"
            ? "NOT_FOUND"
            : "ERROR",
      );
    });

    test("retention hides old payment verification and checkout links", async () => {
      const credential = await credentials(api(), { provider });
      const payment = await initiate(api(), { provider, credential });
      await complete(api(), payment);
      setSystemTime(new Date(Date.now() + 8 * 86400000));
      expect(
        (await api().request(`/v1/checkout/${payment.token}`)).status,
      ).toBe(404);
      const result = await verification(api(), payment);
      expect(result.status).toBe(provider === "khalti" ? 404 : 200);
      expect(await body(result)).toMatchObject(
        provider === "khalti"
          ? { detail: "Not found." }
          : provider === "esewa"
            ? { status: "NOT_FOUND" }
            : { status: "ERROR", statusDesc: "TRANSACTION NOT FOUND" },
      );
    });
  },
);

describe("reference uniqueness and credential replacement", () => {
  const api = apiSuite();

  test.each(["esewa", "connectips"] satisfies Provider[])(
    "%s atomically rejects duplicate references, including after key replacement",
    async (provider) => {
      const credential = await credentials(api(), { provider });
      const responses = await Promise.all([
        initiation(api(), { provider, credential }),
        initiation(api(), { provider, credential }),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual(
        provider === "esewa" ? [302, 400] : [303, 403],
      );
      const replacement = await credentials(api(), { provider, replace: true });
      const duplicate = await initiation(api(), {
        provider,
        credential: replacement,
      });
      expect(duplicate.status).toBe(provider === "esewa" ? 400 : 403);
    },
  );

  test("Khalti accepts repeated order IDs and rejects a different provider key", async () => {
    const credential = await credentials(api(), { provider: "khalti" });
    const first = await initiate(api(), { provider: "khalti", credential });
    const second = await initiate(api(), { provider: "khalti", credential });
    expect(first.pidx).not.toBe(second.pidx);
    const other = await credentials(api(), { provider: "esewa" });
    const denied = await verification(api(), first, { credential: other });
    expect(denied.status).toBe(401);
  });

  test("Khalti replacement can verify retained payments but the old and revoked keys cannot", async () => {
    const credential = await credentials(api(), { provider: "khalti" });
    const payment = await initiate(api(), { provider: "khalti", credential });
    await complete(api(), payment);
    const replacement = await credentials(api(), {
      provider: "khalti",
      replace: true,
    });
    expect((await verification(api(), payment)).status).toBe(401);
    expect(
      (await verification(api(), payment, { credential: replacement })).status,
    ).toBe(200);
    await dashboard(
      api(),
      { provider: "khalti", method: "DELETE" },
      "/credentials",
    );
    expect(
      (await verification(api(), payment, { credential: replacement })).status,
    ).toBe(401);
  });

  test("eSewa status remains available under the original product code after revocation", async () => {
    const credential = await credentials(api(), { provider: "esewa" });
    const payment = await initiate(api(), { provider: "esewa", credential });
    await complete(api(), payment);
    await credentials(api(), { provider: "esewa", replace: true });
    await dashboard(
      api(),
      { provider: "esewa", method: "DELETE" },
      "/credentials",
    );
    expect((await body(await verification(api(), payment))).status).toBe(
      "COMPLETE",
    );
  });

  test("eSewa signs an existing checkout with the current secret after replacement", async () => {
    const credential = await credentials(api(), { provider: "esewa" });
    const payment = await initiate(api(), { provider: "esewa", credential });
    const replacement = await credentials(api(), {
      provider: "esewa",
      replace: true,
    });
    const result = await complete(api(), payment);
    expect(result.status).toBe(303);
    const location = result.headers.get("Location");
    if (!location) throw new Error("Merchant return URL missing.");
    const encoded = new URL(location).searchParams.get("data");
    if (!encoded) throw new Error("Signed eSewa return data missing.");
    const callback = z
      .object({
        transaction_code: z.string(),
        status: z.literal("COMPLETE"),
        total_amount: z.literal("1200"),
        transaction_uuid: z.literal("ORDER-001"),
        product_code: z.literal(credential.key.prefix),
        signed_field_names: z.literal(
          "transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names",
        ),
        signature: z.string(),
      })
      .strict()
      .parse(JSON.parse(Buffer.from(encoded, "base64").toString()));
    const message =
      "transaction_code=" +
      callback.transaction_code +
      ",status=COMPLETE,total_amount=1200,transaction_uuid=ORDER-001,product_code=" +
      credential.key.prefix +
      ",signed_field_names=transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names";
    expect(callback.signature).toBe(
      createHmac("sha256", replacement.secret).update(message).digest("base64"),
    );
    expect(callback.signature).not.toBe(
      createHmac("sha256", credential.secret).update(message).digest("base64"),
    );
  });

  test("eSewa cannot consume or sign a checkout after credential revocation", async () => {
    const credential = await credentials(api(), { provider: "esewa" });
    const payment = await initiate(api(), { provider: "esewa", credential });
    await dashboard(
      api(),
      { provider: "esewa", method: "DELETE" },
      "/credentials",
    );
    expect((await complete(api(), payment)).status).toBe(409);
    expect(
      await body(await api().request(`/v1/checkout/${payment.token}`)),
    ).toMatchObject({ used: false });
  });

  test("connectIPS authenticates the account before resolving a transaction reference", async () => {
    const credential = await credentials(api(), { provider: "connectips" });
    const payment = await initiate(api(), {
      provider: "connectips",
      credential,
    });
    await complete(api(), payment);
    const other = await credentials(api(), {
      provider: "khalti",
    });
    expect(
      (await verification(api(), payment, { credential: other })).status,
    ).toBe(401);
    const replacement = await credentials(api(), {
      provider: "connectips",
      replace: true,
    });
    expect((await verification(api(), payment)).status).toBe(401);
    expect(
      (
        await body(
          await verification(api(), payment, { credential: replacement }),
        )
      ).status,
    ).toBe("SUCCESS");
  });

  test.each(["esewa", "connectips"] satisfies Provider[])(
    "%s verifies the original amount before applying an amount-mismatch scenario",
    async (provider) => {
      const credential = await credentials(api(), { provider });
      const payment = await initiate(api(), { provider, credential });
      await complete(api(), payment, "amount-mismatch");
      expect(
        await body(await verification(api(), payment, { amount: "120001" })),
      ).toMatchObject(
        provider === "esewa"
          ? { status: "NOT_FOUND" }
          : { status: "ERROR", statusDesc: "TRANSACTION NOT FOUND" },
      );
      expect((await body(await verification(api(), payment))).status).toBe(
        provider === "esewa" ? "COMPLETE" : "SUCCESS",
      );
    },
  );
});
