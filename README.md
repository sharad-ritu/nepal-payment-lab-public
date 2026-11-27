# Nepal Payment Lab

A controllable Khalti, eSewa, connectIPS, and NPX OnePG web-checkout simulator for local development and automated tests. Generate one credential per provider, choose initiation failures on the dashboard, and select each payment's return and verification outcome on checkout. No money moves.

[Nepal Payment Solution Limited](https://nepalpayment.com/en/company-profile) currently uses the NPX brand. The lab implements its OnePG contract from the supplied 2025 guide, which calls the provider NPS. The provider ID `nps`, `/nps/` endpoints, and `NPS_*` environment examples retain their existing names for integration compatibility.

[Project requirements and official provider docs](docs/requirements.md) describe the supported flows and intentional lab differences. Contributor instructions are in [AGENTS.md](AGENTS.md) and [docs/agents](docs/agents).

## Project history

Development started in a private repository. The first commit here is a snapshot of the project at its first public release.

## Disclaimer

Supported integrations follow the references listed in [provider contracts](docs/requirements.md#provider-contracts-and-official-documentation). NPX follows the supplied 2025 OnePG guidelines. Provider documentation may change, and newer or private merchant specifications may differ from these references.

Nepal Payment Lab is an independent simulator for local development and automated tests. It moves no real money and does not process payments through live providers. Use lab credentials and synthetic test data, never production credentials or real customer information.

Simulated responses, failure scenarios, timing, and security checks may differ from live gateways. Responses were compared with the official Khalti, eSewa, connectIPS, and NPX sandboxes on 2026-10-31 ([report](docs/sandbox-comparison.md)), but completed eSewa, connectIPS, and NPX payments and production gateways were not. Passing lab tests does not guarantee production compatibility. Validate against current provider documentation and official sandboxes before going live. Provider names and logos identify simulated integrations and do not imply endorsement or certification.

## Run locally with Docker

Install Docker with Compose v2, clone this repository, and run:

```sh
docker compose up --build --wait
```

Compose builds the apps, starts PostgreSQL, applies the initial migration, and starts the API and web app in that order. The command waits for the services to become healthy and leaves them running in the background. No environment files, login, registration, or external accounts are required. The first build needs internet access to download images, dependencies, and fonts.

Open [the dashboard](http://localhost:45173/dashboard), select a provider, and generate lab credentials. Follow its Integration guide to connect your merchant app. Choose a scenario on the checkout page, then verify the result from your merchant backend.

For connectIPS, save your Success URL and Failure URL in Connection before posting the gateway form. For NPX, save the default Response URL before creating a process. Use URLs that your browser can reach, such as your local merchant app's callback.

The web app, API, and database bind to `127.0.0.1` on ports 45173, 45174, and 45175. This is a local app with one shared workspace and no dashboard authentication. Provider credentials and signatures remain part of the simulated payment contracts.

Credentials, settings, and payments persist in the `local-postgres-data` Docker volume across restarts. Check startup with `docker compose ps -a` and `docker compose logs migrate api web`. Stop the app with:

```sh
docker compose down
```

To delete all local lab data and start fresh:

```sh
docker compose down --volumes
docker compose up --build --wait
```

The database starts from one initial migration, `packages/database/migrations/0000_local_workspace.sql`. No seed step is required. Generate provider credentials from the dashboard after startup.

## Develop outside Docker

Use Bun 1.4.1 and Node.js 24.16.0. Install the pinned dependencies and copy the optional development environment files:

```sh
bun install --frozen-lockfile
cp -n apps/api/.env.example apps/api/.env
cp -n apps/web/.env.example apps/web/.env.local
cp -n packages/database/.env.example packages/database/.env
docker compose up -d postgres
bun run db:migrate
bun run dev
```

If the full Docker stack is running, stop its web and API services before starting development servers on the same ports. `API_INTERNAL_URL` connects the web server to the API. `API_PUBLIC_URL` is the API origin copied into merchant configuration. `WEB_ORIGIN` is the web origin used in checkout links.

Generate a migration after changing the schema with `bun run db:generate`. Apply migrations with `bun run db:migrate`. Docker startup applies checked-in migrations automatically.

## Workspace

- `apps/web` owns the dashboard, checkout UI, and same-origin API forwarding.
- `apps/api` owns HTTP handlers, provider authentication, simulation, and database operations.
- `packages/shared` holds browser-safe schemas, types, and scenario presets.
- `packages/database` holds the connection, schema, migrations, and repositories.

`bun run lint` checks formatting and lint rules. `bun run typecheck` checks every workspace and the Playwright configuration. `bun run format` applies Biome formatting and safe fixes. Agents follow the command restrictions in [AGENTS.md](AGENTS.md).

## Tests

| Command | Coverage | Requirements |
| --- | --- | --- |
| `bun run test:unit` | Simulation, signatures, parsing, schemas, and previews | Installed dependencies |
| `bun run test:integration` | Provider contracts, credentials, payment lifecycle, concurrency, and transactions | `TEST_DATABASE_URL` |
| `bun run test` | Unit and integration suites | `TEST_DATABASE_URL` |
| `bun run test:e2e` | Dashboard and checkout browser workflows | Running apps and Chromium |

Integration tests use the real Express app and PostgreSQL. Each test creates an isolated schema, applies the checked-in migration, and removes the schema on completion. Use a dedicated test database whose user can create schemas. A missing `TEST_DATABASE_URL` fails the suite.

Create a test database in the local Compose PostgreSQL service:

```sh
docker compose exec postgres psql -U lab -d postgres -c 'CREATE DATABASE nepal_payment_lab_test;'
TEST_DATABASE_URL=postgresql://lab:lab@localhost:45175/nepal_payment_lab_test bun run test
```

Start the apps before browser tests. Browser tests replace and revoke the local workspace's lab credentials and change provider settings. They require no saved login session. Install Chromium and run:

```sh
bunx --no-install playwright install chromium
bun run test:e2e
```

Browser defaults are `E2E_WEB_URL=http://localhost:45173` and `E2E_API_URL=http://localhost:45174`. Override these process variables for other local addresses. Playwright never starts app servers. CI runs unit and integration tests against a dedicated PostgreSQL service.
