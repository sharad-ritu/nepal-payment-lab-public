CREATE TABLE "simulated_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"provider_payment_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"checkout_digest" text NOT NULL,
	"order_id" text NOT NULL,
	"order_name" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"return_url" text NOT NULL,
	"failure_url" text,
	"provider_details" jsonb,
	"scenario_key" text NOT NULL,
	"scenario_snapshot" jsonb NOT NULL,
	"simulated_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "simulated_payments_provider_payment_id_unique" UNIQUE("provider_payment_id"),
	CONSTRAINT "simulated_payments_checkout_digest_unique" UNIQUE("checkout_digest")
);
--> statement-breakpoint
CREATE TABLE "provider_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"initiation_mode" text DEFAULT 'allow' NOT NULL,
	"success_url" text,
	"failure_url" text,
	"response_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"prefix" text NOT NULL,
	"digest" text NOT NULL,
	"secret" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_credentials_prefix_unique" UNIQUE("prefix")
);
--> statement-breakpoint
ALTER TABLE "simulated_payments" ADD CONSTRAINT "simulated_payments_account_id_provider_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."provider_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_account_id_provider_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."provider_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_retention_idx" ON "simulated_payments" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_account_provider_idx" ON "provider_accounts" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_credential_account_idx" ON "provider_credentials" USING btree ("account_id");