import { and, eq, gte } from "drizzle-orm";
import type { Database } from "../index";
import { retainedSince } from "../retention";
import { type PaymentRecord, payments, providerAccounts } from "../schema";

// The unsigned gateway form is authorized by its unguessable process ID.
// Lock in the same order as checkout and credential changes.
export function prepareNpsGateway<T>({
  db,
  processId,
  decide,
}: {
  db: Database;
  processId: string;
  decide: (payment: PaymentRecord) => {
    changes: Pick<PaymentRecord, "returnUrl" | "providerDetails"> | null;
    result: T;
  };
}) {
  return db.transaction(async (tx) => {
    const [reference] = await tx
      .select({ accountId: payments.accountId })
      .from(payments)
      .innerJoin(providerAccounts, eq(payments.accountId, providerAccounts.id))
      .where(
        and(
          eq(providerAccounts.provider, "nps"),
          eq(payments.providerPaymentId, processId),
          gte(payments.createdAt, retainedSince()),
        ),
      );
    if (!reference) return null;
    await tx
      .select({ id: providerAccounts.id })
      .from(providerAccounts)
      .where(eq(providerAccounts.id, reference.accountId))
      .for("update");
    const [payment] = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.providerPaymentId, processId),
          eq(payments.accountId, reference.accountId),
          gte(payments.createdAt, retainedSince()),
        ),
      )
      .for("update");
    if (!payment) return null;
    const decision = decide(payment);
    if (decision.changes)
      await tx
        .update(payments)
        .set(decision.changes)
        .where(eq(payments.id, payment.id));
    return decision.result;
  });
}
