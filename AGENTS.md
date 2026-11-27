# AGENTS.md

Nepal Payment Lab is a controllable fake Khalti/eSewa/connectIPS/NPX web-checkout provider for local development and automated tests. It has one shared local workspace, one credential per provider, dashboard initiation controls, per-payment outcomes, and NPX OnePG process/gateway/status flows.

- Use Bun 1.4.1 (`bun install --frozen-lockfile`); do not use npm commands.
- Implement product behavior only when the task asks for it.
- Add or update tests only when explicitly requested.
- Never run build, start, dev, or test commands, including through aliases, compound scripts, or background processes. Never start app servers or workers.
- Install packages, run migrations/seeds, or change env configuration only when explicitly requested.
- These restrictions still apply when asked to implement, fix, or verify a change. Read-only lint, typecheck, and format checks are allowed.

Read the relevant guide before working in its area:

- Editing or reviewing code: [TypeScript, formatting, and JSX](docs/agents/coding.md).
- Changing service boundaries, packages, or the scenario engine: [Architecture](docs/agents/architecture.md).
- Changing endpoints, validation, logging, or secrets: [API and data safety](docs/agents/api-and-data.md).
- Changing behavior or finishing work: [Verification and workflow](docs/agents/verification.md).

For product scope, provider contracts, or intentional simulator differences, read [project requirements and provider references](docs/requirements.md). For local setup and developer commands, read the [README](README.md).
