# Architecture

## Current scope

Read [project requirements and provider references](../requirements.md) for the account/provider model, supported contracts, and intentional simulator differences.

- `apps/web` owns UI and same-origin API forwarding. It never imports the database package.
- `apps/api` owns HTTP handlers and all database operations. Dashboard operations use the single local account for the selected provider. Lookup uses the provider account resolved from the lab credential.
- `packages/shared` holds browser-safe Zod schemas, inferred types, initiation modes, and checkout presets.
- `packages/database` holds the connection factory, schema, migrations, and repositories. SQL belongs in repositories.

`apps/api/src/index.ts` validates process configuration and supplies the database and checkout web origin to `createApp`. Provider routers pass that origin to checkout issuance. Importing the application does not require a configured database URL; the logger reads only its own log level.

## Organization

Co-locate route UI under its page. Shared UI belongs in `components/ui`. Group API routes by feature under `modules`; pass the database into router factories. Provider routers share request mechanics (scenario header, initiation failures, held timeouts, Basic auth) through `modules/provider-http.ts` while keeping their own response bodies. Keep simple CRUD in routes and repositories; introduce business functions where rules justify them. Use named files, avoiding pass-through layers. Add packages only when their ownership or reuse earns a separate package.

Provider status vocabulary and checkout durations live in `packages/shared/src/payment-policy.ts`. Amount limits, merchant URL parsing, checkout token validation, and persisted provider-detail schemas also belong to the shared package. API responses and browser previews read those definitions; UI copy and HTTP response envelopes remain with their respective consumers.

## Queries and local state

The dashboard owns its query provider. Query keys include the provider ID. Data is immediately stale, inactive data is discarded, and retries are disabled. Lab secrets are test-only and visible in the dashboard by design; keep them out of storage beyond the query cache and out of logs.

Provider accounts are unique by provider, and each has at most one credential. Credential generation and rotation serialize on the account row; an initial generation must not silently replace an existing key. Revocation preserves the account and payments so a new credential can access that account's retained payments.

## Simulation

Dashboard initiation settings affect new requests account-wide. Registered merchant URLs (connectIPS success/failure, NPX response) are account settings declared per provider in `registeredUrlKeys`; new payments copy them at creation, so later edits never change an existing payment. Failure modes create no checkout or payment. Khalti accepts repeated order IDs and creates distinct payments. eSewa UUIDs, connectIPS TXNIDs, and NPX MerchantTxnIds must be unique within the account during retention; serialize duplicate checks and insertion on the account row.

Checkout validates its selection, locks the account before the payment, checks expiry, and commits the chosen snapshot before redirecting. Read the current eSewa signing credential under the same account lock. Repeated submissions cannot modify an already completed checkout. Lookup decisions remain pure in `apps/api/src/modules/simulation.ts`, with time passed explicitly. Pending may expire; completed/canceled results remain stable within retention.

NPX creates a process before its unsigned gateway form opens checkout. Bind the gateway's IDs, amount, destination, and remarks under the same account-then-payment lock order. Derive the checkout capability from the random ProcessId and persist only its digest. Keep the process inaccessible to checkout until the gateway form has been accepted. Callback settings are captured when the process is created; a gateway ResponseUrl can override that payment's browser destination once.

NPX checkout commits the selected outcome before the browser return. Merchants verify the transaction through CheckTransactionStatus. The lab has no webhook delivery or notification queue.

Timeouts wait outside transactions. Keep provider parsing, authentication, rate limits, and error bodies separate from dashboard middleware. Never proxy to live providers or fetch merchant return URLs. Store credential digests for authentication and lab secrets for dashboard display, eSewa signing, and NPX HMAC verification. Store checkout tokens only as digests. Reads enforce seven-day payment retention, and the API startup/hourly sweep removes expired records.

Checkout rate limits apply to verified payment IDs. Unknown checkout tokens return 404 before a rate-limit bucket is allocated. Forwarded web requests share an API peer address, so IP-based checkout limits would let one visitor block other payments. Compose binds all published ports to loopback.

The product has no project management, run reports, replay, operation event logs, or merchant confirmations. Khalti Web Checkout, eSewa ePay, connectIPS Gateway, and NPX OnePG are supported. Other provider products remain out of scope. Introduce additional providers only when requested.
