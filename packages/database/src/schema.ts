import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const providerAccounts = pgTable(
  "provider_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    initiationMode: text("initiation_mode").default("allow").notNull(),
    // Registered browser returns: connectIPS success/failure, NPX response.
    successUrl: text("success_url"),
    failureUrl: text("failure_url"),
    responseUrl: text("response_url"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("provider_account_provider_idx").on(table.provider)],
);

export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => providerAccounts.id, { onDelete: "cascade" }),
    prefix: text("prefix").notNull().unique(),
    digest: text("digest").notNull(),
    secret: text("secret"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("provider_credential_account_idx").on(table.accountId),
  ],
);

export const payments = pgTable(
  "simulated_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => providerAccounts.id, { onDelete: "cascade" }),
    providerPaymentId: text("provider_payment_id").notNull().unique(),
    transactionId: text("transaction_id").notNull(),
    checkoutDigest: text("checkout_digest").notNull().unique(),
    orderId: text("order_id").notNull(),
    orderName: text("order_name").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    returnUrl: text("return_url").notNull(),
    failureUrl: text("failure_url"),
    providerDetails: jsonb("provider_details"),
    scenarioKey: text("scenario_key").notNull(),
    scenarioSnapshot: jsonb("scenario_snapshot").notNull(),
    simulatedAt: timestamp("simulated_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("payments_retention_idx").on(table.createdAt)],
);

export type ProviderAccountRecord = typeof providerAccounts.$inferSelect;

export type PaymentRecord = typeof payments.$inferSelect;
