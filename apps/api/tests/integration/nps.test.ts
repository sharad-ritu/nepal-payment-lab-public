import {
  afterEach,
  describe,
  expect,
  mock,
  setSystemTime,
  test,
} from "bun:test";
import { createHash } from "node:crypto";
import type { ScenarioKey } from "@nepal-payment-lab/shared";
import { z } from "zod";
import {
  configureNps,
  createNpsProcess,
  gatewayValues,
  npsGateway,
  npsIdentity,
  npsRequest,
  npsVerification,
  openNpsCheckout,
} from "./nps-support";
import {
  apiSuite,
  body,
  complete,
  credentials,
  dashboard,
  setMode,
} from "./support";
import { captureTimeout } from "./timeout";

describe("NPS OnePG checkout and status", () => {
  const api = apiSuite();
  afterEach(() => {
    setSystemTime();
    mock.restore();
  });
  async function connection() {
    return configureNps(api());
  }

  test("a replaced merchant identity cannot open a process using mismatched gateway fields", async () => {
    const credential = await connection();
    const first = await createNpsProcess(api(), credential);
    const replacement = await credentials(api(), {
      provider: "nps",
      replace: true,
    });
    expect(
      (await npsGateway(api(), first, npsIdentity(replacement))).status,
    ).toBe(400);
    await openNpsCheckout(api(), first);
  });

  test("gateway forms reject duplicate multipart fields and unknown scenario headers reserve no process", async () => {
    const credential = await connection();
    const rejected = await npsRequest(
      api(),
      credential,
      "GetProcessId",
      {
        ...npsIdentity(credential),
        Amount: "1200.50",
        MerchantTxnId: "ORDER-001",
      },
      "unknown",
    );
    expect(rejected.status).toBe(400);
    const process = await createNpsProcess(api(), credential);
    const form = new FormData();
    for (const [key, value] of Object.entries(gatewayValues(process)))
      form.append(key, value);
    form.append("MerchantId", npsIdentity(credential).MerchantId);
    expect(
      (
        await api().request("/nps/Payment/Index", {
          method: "POST",
          body: form,
        })
      ).status,
    ).toBe(400);
    await openNpsCheckout(api(), process);
  });

  test("revoking credentials after process creation does not change its gateway or browser return", async () => {
    const credential = await connection();
    const process = await createNpsProcess(api(), credential);
    await dashboard(
      api(),
      { provider: "nps", method: "DELETE" },
      "/credentials",
    );
    const payment = await openNpsCheckout(api(), process);
    const result = await complete(api(), payment);
    expect(result.status).toBe(303);
    expect(
      new URL(z.string().parse(result.headers.get("Location"))).origin,
    ).toBe("http://merchant.test");
    expect((await npsVerification(api(), process)).status).toBe(401);
  });

  test("signed instrument and fee APIs preserve documented casing and string amounts", async () => {
    const credential = await connection();
    expect(
      await body(
        await npsRequest(
          api(),
          credential,
          "GetPaymentInstrumentDetails",
          npsIdentity(credential),
        ),
      ),
    ).toEqual({
      code: "0",
      message: "Success",
      errors: [],
      data: [
        {
          InstitutionName: "Test Bank",
          InstrumentName: "Test Bank",
          InstrumentCode: "TMBANK",
          InstrumentValue: null,
          LogoUrl: "",
          BankUrl: "MBanking",
          BankType: "MBanking",
        },
      ],
    });
    expect(
      await body(
        await npsRequest(api(), credential, "GetServiceCharge", {
          ...npsIdentity(credential),
          Amount: "100.00",
          InstrumentCode: "TMBANK",
        }),
      ),
    ).toEqual({
      code: "0",
      message: "Success",
      errors: [],
      data: {
        Amount: "100.00",
        CommissionType: "f",
        ChargeValue: "5",
        TotalChargeAmount: 5,
      },
    });
  });

  test("GetProcessId needs a registered response URL and reserves a unique merchant reference", async () => {
    const credential = await credentials(api(), { provider: "nps" });
    const values = {
      ...npsIdentity(credential),
      Amount: "1200.50",
      MerchantTxnId: "ORDER-001",
    };
    const unregistered = await npsRequest(
      api(),
      credential,
      "GetProcessId",
      values,
    );
    expect(unregistered.status).toBe(200);
    expect(await body(unregistered)).toEqual({
      code: "1",
      message: "Error",
      errors: [
        {
          error_code: "1",
          error_message: "Configure Response URL in the NPX dashboard.",
        },
      ],
      data: null,
    });
    await configureNps(api(), { credential });
    const processes = await Promise.all([
      npsRequest(api(), credential, "GetProcessId", values),
      npsRequest(api(), credential, "GetProcessId", values),
    ]);
    const results = await Promise.all(processes.map(body));
    expect(results.map((result) => result.code).sort()).toEqual(["0", "1"]);
    expect(results.find((result) => result.code === "1")).toEqual({
      code: "1",
      message: "Error",
      errors: [{ error_code: "1", error_message: "Duplicate Record" }],
      data: null,
    });
  });

  test("a process cannot be checked out before the gateway form validates its identity", async () => {
    const credential = await connection();
    const process = await createNpsProcess(api(), credential);
    expect(await body(await npsVerification(api(), process))).toEqual({
      code: "1",
      message: "Error",
      errors: [
        { error_code: "3", error_message: "Transaction not initialized yet" },
      ],
      data: null,
    });
    // Independent capability derivation checks that bypassing the gateway cannot
    // expose or consume a checkout.
    const token = createHash("sha256")
      .update(`nps-checkout:${process.processId}`)
      .digest("base64url");
    expect((await api().request(`/v1/checkout/${token}`)).status).toBe(404);
    const premature = await api().request(`/v1/checkout/${token}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioKey: "normal-completion" }),
    });
    expect(premature.status).toBe(409);
    expect(await body(premature)).toEqual({
      kind: "checkout_unavailable",
      message: "Submit the NPX gateway form first.",
    });
    for (const overrides of [
      { Amount: "1200.51" },
      { MerchantTxnId: "wrong" },
      { MerchantId: "999" },
      { MerchantName: "another" },
      { InstrumentCode: "unknown" },
      { ResponseUrl: "not a url" },
      { ResponseUrl: "http://[invalid]/return" },
      { ResponseUrl: "https://user:password@merchant.test/return" },
    ]) {
      expect((await npsGateway(api(), process, overrides)).status).toBe(400);
    }
    const payment = await openNpsCheckout(api(), process, {}, true);
    expect(
      (await body(await api().request(`/v1/checkout/${payment.token}`)))
        .amountMinor,
    ).toBe(120050);
    const initial = await body(await npsVerification(api(), process));
    expect(initial).toMatchObject({
      code: "0",
      data: {
        Status: "Pending",
        Amount: "1200.5",
        ProcessId: process.processId,
      },
    });
  });

  const outcomes = [
    { key: "normal-completion", status: "Success", amount: "1200.5" },
    { key: "pending-payment", status: "Pending", amount: "1200.5" },
    { key: "user-cancellation", status: "Fail", amount: "1200.5" },
    { key: "expired-payment", status: "Fail", amount: "1200.5" },
    { key: "amount-mismatch", status: "Success", amount: "1200.51" },
    {
      key: "completed-redirect-pending-lookup",
      status: "Pending",
      amount: "1200.5",
    },
    {
      key: "completed-redirect-cancelled-lookup",
      status: "Fail",
      amount: "1200.5",
    },
    {
      key: "completed-redirect-expired-lookup",
      status: "Fail",
      amount: "1200.5",
    },
  ] satisfies { key: ScenarioKey; status: string; amount: string }[];
  test.each(outcomes)(
    "$key returns transaction IDs and preserves the selected verification outcome",
    async (outcome) => {
      const credential = await connection();
      const process = await createNpsProcess(api(), credential);
      const payment = await openNpsCheckout(api(), process);
      const result = await complete(api(), payment, outcome.key);
      expect(result.status).toBe(303);
      const location = z.string().parse(result.headers.get("Location"));
      const destination = new URL(location);
      const gatewayTxnId = z
        .string()
        .regex(/^\d+$/)
        .parse(destination.searchParams.get("GatewayTxnId"));
      expect(Object.fromEntries(destination.searchParams)).toEqual({
        existing: "keep",
        MerchantTxnId: process.orderId,
        GatewayTxnId: gatewayTxnId,
      });
      expect(destination.pathname).toBe("/success");
      const expected = {
        code: "0",
        message: "Success",
        errors: [],
        data: {
          GatewayReferenceNo: gatewayTxnId,
          Amount: outcome.amount,
          ServiceCharge: "5",
          TransactionRemarks: "Test checkout",
          TransactionRemarks2: "",
          TransactionRemarks3: "",
          ProcessId: process.processId,
          TransactionDate: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
          ),
          MerchantTxnId: process.orderId,
          CbsMessage: outcome.status === "Fail" ? "Transaction failed" : "",
          Status: outcome.status,
          Institution: "Test Bank",
          Instrument: "Test MBanking",
          PaymentCurrency: "NPR",
          ExchangeRate: "1",
        },
      };
      expect(await body(await npsVerification(api(), process))).toEqual(
        expected,
      );
      expect(await body(await npsVerification(api(), process))).toEqual(
        expected,
      );
      const checkout = await body(
        await api().request(`/v1/checkout/${payment.token}`),
      );
      expect(checkout).toMatchObject({
        used: true,
        scenarioKey: outcome.key,
      });
      expect(checkout).not.toHaveProperty("notification");
      expect((await complete(api(), payment)).status).toBe(409);
    },
  );

  test("gateway destination overrides are captured once and later settings changes affect future processes", async () => {
    const credential = await connection();
    const process = await createNpsProcess(api(), credential);
    const captured = await createNpsProcess(api(), credential, "CAPTURED");
    await configureNps(api(), {
      credential,
      responseUrl: "http://another-merchant.test/return",
    });
    const payment = await openNpsCheckout(api(), process, {
      ResponseUrl: "http://override.test/return?keep=yes",
    });
    expect(
      (
        await npsGateway(api(), process, {
          ResponseUrl: "http://attacker.test/return",
        })
      ).status,
    ).toBe(400);
    const result = await complete(api(), payment);
    expect(new URL(z.string().parse(result.headers.get("Location"))).host).toBe(
      "override.test",
    );

    const capturedPayment = await openNpsCheckout(api(), captured);
    const capturedReturn = await complete(api(), capturedPayment);
    expect(
      new URL(z.string().parse(capturedReturn.headers.get("Location"))).origin,
    ).toBe("http://merchant.test");

    const future = await createNpsProcess(api(), credential, "FUTURE");
    const futurePayment = await openNpsCheckout(api(), future);
    const futureReturn = await complete(api(), futurePayment);
    expect(
      new URL(z.string().parse(futureReturn.headers.get("Location"))).origin,
    ).toBe("http://another-merchant.test");
  });

  test("duplicate checkout submissions commit only one selected outcome", async () => {
    const credential = await connection();
    const process = await createNpsProcess(api(), credential);
    const payment = await openNpsCheckout(api(), process);
    const responses = await Promise.all([
      complete(api(), payment, "normal-completion"),
      complete(api(), payment, "user-cancellation"),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      303, 409,
    ]);
    const current = await body(
      await api().request(`/v1/checkout/${payment.token}`),
    );
    expect(
      (await body(await npsVerification(api(), process))).data,
    ).toMatchObject({
      Status: current.scenarioKey === "normal-completion" ? "Success" : "Fail",
    });
  });

  test("current credentials verify retained payments while other providers and revoked keys cannot", async () => {
    const credential = await connection();
    const process = await createNpsProcess(api(), credential);
    const payment = await openNpsCheckout(api(), process);
    await complete(api(), payment);
    const other = await credentials(api(), { provider: "khalti" });
    expect((await npsVerification(api(), process, other)).status).toBe(401);
    const replacement = await credentials(api(), {
      provider: "nps",
      replace: true,
    });
    expect((await npsVerification(api(), process)).status).toBe(401);
    expect(
      (await body(await npsVerification(api(), process, replacement))).data,
    ).toMatchObject({ Status: "Success" });
    const duplicate = await npsRequest(api(), replacement, "GetProcessId", {
      ...npsIdentity(replacement),
      Amount: "1200.50",
      MerchantTxnId: process.orderId,
    });
    expect(await body(duplicate)).toMatchObject({
      code: "1",
      errors: [{ error_code: "1", error_message: "Duplicate Record" }],
    });
    await dashboard(
      api(),
      { provider: "nps", method: "DELETE" },
      "/credentials",
    );
    expect((await npsVerification(api(), process, replacement)).status).toBe(
      401,
    );
  });

  test("process expiry and retention prevent gateway or checkout reuse", async () => {
    const credential = await connection();
    const process = await createNpsProcess(api(), credential);
    const payment = await openNpsCheckout(api(), process);
    const state = await body(
      await api().request(`/v1/checkout/${payment.token}`),
    );
    setSystemTime(new Date(z.string().parse(state.expiresAt)));
    expect((await complete(api(), payment)).status).toBe(409);
    expect((await npsGateway(api(), process)).status).toBe(409);
    expect(
      (await body(await npsVerification(api(), process))).data,
    ).toMatchObject({ Status: "Fail" });
    setSystemTime(new Date(Date.now() + 8 * 86400000));
    expect((await api().request(`/v1/checkout/${payment.token}`)).status).toBe(
      404,
    );
    expect((await body(await npsVerification(api(), process))).code).toBe("1");
  });

  test.each([
    "invalid-payment-id",
    "lookup-server-error",
  ] satisfies ScenarioKey[])(
    "%s preserves the NPS error envelope",
    async (scenario) => {
      const credential = await connection();
      const process = await createNpsProcess(api(), credential);
      const payment = await openNpsCheckout(api(), process);
      await complete(api(), payment, scenario);
      const result = await npsVerification(api(), process);
      expect(result.status).toBe(
        scenario === "lookup-server-error" ? 500 : 200,
      );
      expect(await body(result)).toEqual({
        code: "1",
        message: "Error",
        errors: [
          {
            error_code: scenario === "lookup-server-error" ? "1" : "3",
            error_message:
              scenario === "lookup-server-error"
                ? "Internal server error."
                : "Transaction not initialized yet",
          },
        ],
        data: null,
      });
    },
  );

  test.each(["validation-error", "auth-error", "server-error"] as const)(
    "%s creates no process or reserved reference",
    async (mode) => {
      const credential = await connection();
      await setMode(api(), { provider: "nps", mode });
      const rejected = await npsRequest(api(), credential, "GetProcessId", {
        ...npsIdentity(credential),
        Amount: "1200.50",
        MerchantTxnId: "ORDER-001",
      });
      expect(rejected.status).toBe(
        mode === "validation-error" ? 400 : mode === "auth-error" ? 401 : 500,
      );
      expect((await body(rejected)).code).toBe("1");
      await setMode(api(), { provider: "nps", mode: "allow" });
      await createNpsProcess(api(), credential);
    },
  );
  test("initiation and verification timeout decisions close the connection without holding account locks", async () => {
    const credential = await connection();
    await setMode(api(), { provider: "nps", mode: "timeout" });
    let timeout = captureTimeout();
    const rejected = npsRequest(api(), credential, "GetProcessId", {
      ...npsIdentity(credential),
      Amount: "1200.50",
      MerchantTxnId: "ORDER-001",
    }).then(
      () => "response",
      () => "closed",
    );
    await timeout.scheduled;
    timeout.expire();
    expect(await rejected).toBe("closed");
    mock.restore();
    await setMode(api(), { provider: "nps", mode: "allow" });
    const process = await createNpsProcess(api(), credential);
    const payment = await openNpsCheckout(api(), process);
    await complete(api(), payment, "lookup-timeout");
    timeout = captureTimeout();
    const lookup = npsVerification(api(), process).then(
      () => "response",
      () => "closed",
    );
    await timeout.scheduled;
    await credentials(api(), { provider: "nps", replace: true });
    timeout.expire();
    expect(await lookup).toBe("closed");
  });
});
