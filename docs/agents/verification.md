# Verification and workflow

Follow the test-writing and command restrictions in [AGENTS.md](../../AGENTS.md). Leave execution of build/test/dev servers to the user.

## Read-only checks

- `bun run lint` (`biome check .`) is a read-only check and may run when useful.
- `bun run typecheck` checks types without emitting builds and may run when useful. It checks the root Playwright files and each workspace, including Bun tests.
- Use the installed toolchain (Bun 1.4.1, pinned lockfile); do not install missing tools unless explicitly requested.
- Run `bun run format` only when formatting changes are intended.

## When tests are explicitly requested

See [README testing instructions](../../README.md#tests) for commands and environment requirements. Unit tests live beside their owning workspace; API integration tests use `apps/api/tests/integration`, database integration tests use `packages/database/tests`, and Playwright workflows use `e2e`.

Exercise public functions, repository transactions, and complete HTTP responses. Keep expected provider fixtures independent of the response builders being checked. Integration tests use real PostgreSQL in isolated schemas without dashboard authentication mocks. Control time for expiry and timeout checks instead of waiting for real delays. Browser tests use the shared local workspace without a saved session. Follow the command restrictions in AGENTS.md even when adding tests.

NPX coverage includes the process/gateway split, HMAC-SHA512, response URL snapshots, status verification, and transaction rollback. Browser coverage includes NPX checkout and response URL configuration. Webhook delivery is outside the lab's scope.

## Finishing work

- Keep changes within the requested scope.
- Keep `.env.example` files synchronized when configuration changes.
- Update setup documentation when developer commands or service responsibilities change.
- Report checks that could not run (per the execution restrictions above) and the concrete blocker, plus the exact commands the user can run.
