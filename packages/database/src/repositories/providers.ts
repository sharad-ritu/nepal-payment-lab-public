import { and, eq } from "drizzle-orm";
import type { Database } from "../index";
import {
  type ProviderAccountRecord,
  providerAccounts,
  providerCredentials,
} from "../schema";

type LocalProvider = { db: Database; provider: string };

type SettingKey =
  | "initiationMode"
  | "successUrl"
  | "failureUrl"
  | "responseUrl";

type Settings = {
  [Key in SettingKey]?: ProviderAccountRecord[Key] | undefined;
};

type KeyValues = { prefix: string; digest: string; secret: string };

export async function getProvider({ db, provider }: LocalProvider) {
  const [row] = await db
    .select({
      account: providerAccounts,
      key: {
        id: providerCredentials.id,
        prefix: providerCredentials.prefix,
        secret: providerCredentials.secret,
        createdAt: providerCredentials.createdAt,
      },
    })
    .from(providerAccounts)
    .leftJoin(
      providerCredentials,
      eq(providerCredentials.accountId, providerAccounts.id),
    )
    .where(eq(providerAccounts.provider, provider));

  return row ?? null;
}

export async function updateProvider({
  db,
  provider,
  input,
}: LocalProvider & { input: Settings }) {
  const [account] = await db
    .update(providerAccounts)
    .set(input)
    .where(eq(providerAccounts.provider, provider))
    .returning();

  return account ?? null;
}

export function rotateProviderKey({
  db,
  provider,
  key,
  replace,
}: LocalProvider & { key: KeyValues; replace: boolean }) {
  return db.transaction(async (tx) => {
    await tx
      .insert(providerAccounts)
      .values({
        provider,
        initiationMode: "allow",
      })
      .onConflictDoNothing({
        target: providerAccounts.provider,
      });

    const [account] = await tx
      .select()
      .from(providerAccounts)
      .where(eq(providerAccounts.provider, provider))
      .for("update");

    if (!account) throw new Error("Provider account was not created.");

    const [existing] = await tx
      .select({ id: providerCredentials.id })
      .from(providerCredentials)
      .where(eq(providerCredentials.accountId, account.id));
    if (existing && !replace) return null;

    await tx
      .delete(providerCredentials)
      .where(eq(providerCredentials.accountId, account.id));

    const [credential] = await tx
      .insert(providerCredentials)
      .values({ ...key, accountId: account.id })
      .returning();
    if (!credential) throw new Error("Credential insert returned no row.");

    return { account, key: credential };
  });
}

export function revokeProviderKey({ db, provider }: LocalProvider) {
  return db.transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(providerAccounts)
      .where(eq(providerAccounts.provider, provider))
      .for("update");

    if (!account) return;

    await tx
      .delete(providerCredentials)
      .where(eq(providerCredentials.accountId, account.id));
  });
}

export async function findCredential({
  db,
  prefix,
  provider,
}: {
  db: Database;
  prefix: string;
  provider: string;
}) {
  const [row] = await db
    .select({ account: providerAccounts, key: providerCredentials })
    .from(providerCredentials)
    .innerJoin(
      providerAccounts,
      eq(providerCredentials.accountId, providerAccounts.id),
    )
    .where(
      and(
        eq(providerCredentials.prefix, prefix),
        eq(providerAccounts.provider, provider),
      ),
    );

  return row ?? null;
}
