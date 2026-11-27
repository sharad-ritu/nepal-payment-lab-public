import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setSystemTime,
  test,
} from "bun:test";
import { randomBytes, randomUUID } from "node:crypto";
import {
  completeCheckout,
  createPayment,
  findCredential,
  getAccountPayment,
  getCheckout,
  getPayment,
  getPaymentByReference,
  getProvider,
  purgeExpiredPayments,
  rotateProviderKey,
} from "../src";
import { openTestDatabase } from "./support/database";

describe("payment persistence and transactions", () => {
  let database: Awaited<ReturnType<typeof openTestDatabase>> | undefined;
  beforeEach(async () => {
    database = await openTestDatabase();
  }, 15000);
  afterEach(async () => {
    setSystemTime();
    if (database) await database.close();
    database = undefined;
  }, 15000);
  function context() {
    if (!database) throw new Error("Test database is not initialized.");
    return database.db;
  }

  function key() {
    return {
      prefix: `test_${randomBytes(12).toString("hex")}`,
      digest: "test-digest",
      secret: randomUUID(),
    };
  }

  async function account(provider: "esewa" | "nps" = "esewa") {
    const result = await rotateProviderKey({
      db: context(),
      provider,
      key: key(),
      replace: false,
    });
    if (!result) throw new Error("Fixture account was not created.");
    return result;
  }

  function payment(
    accountId: string,
    changes: Partial<Parameters<typeof createPayment>[0]["payment"]> = {},
  ) {
    return {
      accountId,
      providerPaymentId: `lab_${randomUUID()}`,
      transactionId: `lab_txn_${randomUUID()}`,
      checkoutDigest: randomUUID(),
      orderId: "ORDER-001",
      orderName: "test-product-code",
      amountMinor: 120000,
      returnUrl: "http://merchant.test/success",
      scenarioKey: "normal-completion",
      scenarioSnapshot: {
        version: 1,
        key: "normal-completion",
        redirectStatus: "completed",
        lookup: { kind: "payment", status: "completed", amountDelta: 0 },
      },
      expiresAt: new Date(Date.now() + 300000),
      ...changes,
    };
  }

  test("all payment read interfaces enforce the retention boundary", async () => {
    const now = new Date();
    setSystemTime(now);
    const current = await account();
    const retained = await createPayment({
      db: context(),
      payment: payment(current.account.id, {
        createdAt: new Date(now.getTime() - 7 * 86400000),
      }),
    });
    const expired = await createPayment({
      db: context(),
      payment: payment(current.account.id, {
        orderId: "OLD-001",
        createdAt: new Date(now.getTime() - 7 * 86400000 - 1),
      }),
    });
    if (!retained || !expired)
      throw new Error("Fixture payments were not created.");
    expect(
      (
        await getPayment({
          db: context(),
          accountId: current.account.id,
          pidx: retained.providerPaymentId,
        })
      )?.id,
    ).toBe(retained.id);
    expect(
      await getPayment({
        db: context(),
        accountId: current.account.id,
        pidx: expired.providerPaymentId,
      }),
    ).toBeNull();
    expect(
      await getAccountPayment({
        db: context(),
        accountId: current.account.id,
        orderId: "OLD-001",
      }),
    ).toBeNull();
    expect(
      await getPaymentByReference({
        db: context(),
        provider: "esewa",
        orderName: "test-product-code",
        orderId: "OLD-001",
      }),
    ).toBeNull();
    expect(
      await getCheckout({ db: context(), digest: expired.checkoutDigest }),
    ).toBeNull();
    const removed = await purgeExpiredPayments({ db: context() });
    expect(removed.count).toBe(1);
    expect(
      (await getCheckout({ db: context(), digest: retained.checkoutDigest }))
        ?.payment.id,
    ).toBe(retained.id);
  });

  test("a reference becomes reusable after its previous payment leaves retention", async () => {
    const current = await account();
    await createPayment({
      db: context(),
      payment: payment(current.account.id, {
        createdAt: new Date(Date.now() - 8 * 86400000),
      }),
      rejectDuplicateReference: true,
    });
    const replacement = await createPayment({
      db: context(),
      payment: payment(current.account.id),
      rejectDuplicateReference: true,
    });
    expect(replacement).not.toBeNull();
  });

  test("a checkout decision error rolls back without consuming the payment", async () => {
    const current = await account();
    const created = await createPayment({
      db: context(),
      payment: payment(current.account.id),
    });
    if (!created) throw new Error("Fixture payment was not created.");
    await expect(
      completeCheckout({
        db: context(),
        digest: created.checkoutDigest,
        decide: () => {
          throw new Error("Return signing failed.");
        },
      }),
    ).rejects.toThrow("Return signing failed.");
    expect(
      (await getCheckout({ db: context(), digest: created.checkoutDigest }))
        ?.payment.simulatedAt,
    ).toBeNull();
    const result = await completeCheckout({
      db: context(),
      digest: created.checkoutDigest,
      decide: (_payment, _account, secret) => ({
        changes: {
          simulatedAt: new Date(),
          scenarioKey: "normal-completion",
          scenarioSnapshot: created.scenarioSnapshot,
        },
        result: secret,
      }),
    });
    expect(result?.result).toBe(current.key.secret);
    expect(
      (await getCheckout({ db: context(), digest: created.checkoutDigest }))
        ?.payment.simulatedAt,
    ).toBeInstanceOf(Date);
  });

  test("a rejected checkout decision leaves the payment available", async () => {
    const current = await account();
    const created = await createPayment({
      db: context(),
      payment: payment(current.account.id),
    });
    if (!created) throw new Error("Fixture payment was not created.");
    expect(
      await completeCheckout({
        db: context(),
        digest: created.checkoutDigest,
        decide: () => ({ changes: null, result: "rejected" }),
      }),
    ).toEqual({ result: "rejected" });
    expect(
      (await getCheckout({ db: context(), digest: created.checkoutDigest }))
        ?.payment.simulatedAt,
    ).toBeNull();
  });

  test("a failed credential replacement preserves the old usable credential", async () => {
    const current = await account();
    const other = await account("nps");
    await expect(
      rotateProviderKey({
        db: context(),
        provider: "esewa",
        key: {
          prefix: other.key.prefix,
          digest: "replacement-digest",
          secret: "replacement-secret",
        },
        replace: true,
      }),
    ).rejects.toThrow();
    const stored = await getProvider({
      db: context(),
      provider: "esewa",
    });
    expect(stored?.key?.secret).toBe(current.key.secret);
    expect(
      (
        await findCredential({
          db: context(),
          prefix: current.key.prefix,
          provider: "esewa",
        })
      )?.account.id,
    ).toBe(current.account.id);
  });
});
