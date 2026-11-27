import { and, eq, gte, lt } from "drizzle-orm";
import type { Database } from "../index";
import { retainedSince } from "../retention";
import {
  type PaymentRecord,
  type ProviderAccountRecord,
  payments,
  providerAccounts,
  providerCredentials,
} from "../schema";

export async function createPayment({
  db,
  payment,
  rejectDuplicateReference = false,
}: {
  db: Database;
  payment: typeof payments.$inferInsert;
  rejectDuplicateReference?: boolean;
}) {
  async function insert(connection: Pick<Database, "insert">) {
    const [inserted] = await connection
      .insert(payments)
      .values(payment)
      .returning();
    if (!inserted) throw new Error("Payment insert returned no row.");

    return inserted;
  }

  if (!rejectDuplicateReference) return insert(db);

  return db.transaction(async (tx) => {
    const [account] = await tx
      .select({ id: providerAccounts.id })
      .from(providerAccounts)
      .where(eq(providerAccounts.id, payment.accountId))
      .for("update");
    if (!account) throw new Error("Provider account was not found.");

    const [existing] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.accountId, account.id),
          eq(payments.orderId, payment.orderId),
          gte(payments.createdAt, retainedSince()),
        ),
      );
    if (existing) return null;

    return insert(tx);
  });
}

export async function getPaymentByReference({
  db,
  provider,
  orderName,
  orderId,
}: {
  db: Database;
  provider: string;
  orderName: string;
  orderId: string;
}) {
  const [row] = await db
    .select({ payment: payments })
    .from(payments)
    .innerJoin(providerAccounts, eq(payments.accountId, providerAccounts.id))
    .where(
      and(
        eq(providerAccounts.provider, provider),
        eq(payments.orderName, orderName),
        eq(payments.orderId, orderId),
        gte(payments.createdAt, retainedSince()),
      ),
    );

  return row?.payment ?? null;
}

export async function getAccountPayment({
  db,
  accountId,
  orderId,
}: {
  db: Database;
  accountId: string;
  orderId: string;
}) {
  const [payment] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.accountId, accountId),
        eq(payments.orderId, orderId),
        gte(payments.createdAt, retainedSince()),
      ),
    );

  return payment ?? null;
}

export async function getPayment({
  db,
  accountId,
  pidx,
}: {
  db: Database;
  accountId: string;
  pidx: string;
}) {
  const [payment] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.accountId, accountId),
        eq(payments.providerPaymentId, pidx),
        gte(payments.createdAt, retainedSince()),
      ),
    );

  return payment ?? null;
}

export async function getCheckout({
  db,
  digest,
}: {
  db: Database;
  digest: string;
}) {
  const [row] = await db
    .select({ payment: payments, account: providerAccounts })
    .from(payments)
    .innerJoin(providerAccounts, eq(payments.accountId, providerAccounts.id))
    .where(
      and(
        eq(payments.checkoutDigest, digest),
        gte(payments.createdAt, retainedSince()),
      ),
    );

  return row ?? null;
}

export function completeCheckout<T>({
  db,
  digest,
  decide,
}: {
  db: Database;
  digest: string;
  decide: (
    payment: PaymentRecord,
    account: ProviderAccountRecord,
    secret: string | null,
  ) => {
    changes: Pick<
      PaymentRecord,
      "simulatedAt" | "scenarioKey" | "scenarioSnapshot"
    > | null;
    result: T;
  };
}) {
  return db.transaction(async (tx) => {
    const [reference] = await tx
      .select({ accountId: payments.accountId })
      .from(payments)
      .where(
        and(
          eq(payments.checkoutDigest, digest),
          gte(payments.createdAt, retainedSince()),
        ),
      );
    if (!reference) return null;

    // Creation and credential changes lock the account first. Keep that order
    // here before locking the payment so completion cannot use a stale secret.
    const [account] = await tx
      .select()
      .from(providerAccounts)
      .where(eq(providerAccounts.id, reference.accountId))
      .for("update");
    if (!account) return null;

    const [payment] = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.checkoutDigest, digest),
          eq(payments.accountId, account.id),
          gte(payments.createdAt, retainedSince()),
        ),
      )
      .for("update");
    if (!payment) return null;

    const [credential] = await tx
      .select({ secret: providerCredentials.secret })
      .from(providerCredentials)
      .where(eq(providerCredentials.accountId, account.id));

    const decision = decide(payment, account, credential?.secret ?? null);

    if (decision.changes)
      await tx
        .update(payments)
        .set(decision.changes)
        .where(eq(payments.id, payment.id));

    return { result: decision.result };
  });
}

export function purgeExpiredPayments({ db }: { db: Database }) {
  return db.delete(payments).where(lt(payments.createdAt, retainedSince()));
}
