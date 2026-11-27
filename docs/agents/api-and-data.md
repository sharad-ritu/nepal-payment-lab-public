# API and data safety

- Validate untrusted input with Zod. Dashboard reads and writes use the single local account for each provider and require no login. Preserve provider credential authentication and scope payment lookups to the resolved provider account. Checkout tokens remain capabilities. Keep Compose ports bound to loopback and enforce same-origin writes in the web API forwarder.
- Preserve transaction boundaries for multi-step writes.
- Keep tokens, credentials, signatures, cookies, lab secrets, payment data, and sensitive information out of logs. Use structured Pino logs in the API and exclude credentials and request bodies from logs.
- Persist only the payment state required for simulation; discard customer details and avoid operation/event payload logging.
- For email, payment, queue, and other external calls, follow existing retry and error-handling patterns.

## Provider compatibility

- Provider-compatible routes must return the provider's exact body, headers, and status code. Do not force them through a generic response wrapper, and do not let dashboard middleware wrap or rewrite simulator responses.
- Must match the provider: method, content type, field names and casing, auth format, amount units, signature construction, status spelling/casing, success and error shapes, return parameters, supported statuses. Must differ: hostname, lab credentials, synthetic IDs, checkout appearance, "no money moves" notice, lab-only scenario header, open return URLs without registration.
- Document every intentional difference in [project requirements and provider references](../requirements.md). Consult its official provider links for field and response contracts.

## Return URLs and secrets

- Khalti and eSewa accept any return URL without registration. connectIPS success/failure URLs and the NPX response URL are registered in the dashboard and captured when a payment is created; the connectIPS form never supplies them. Parse every merchant URL with the shared `merchantUrlSchema` and reject embedded credentials.
- Store credential secrets so the dashboard can display them and eSewa can verify HMAC signatures; this test environment intentionally shows secrets. Never ask for or accept real provider secrets.
- Commit `.env.example` files with names and safe descriptions, never secrets.

Merchant URLs are browser destinations only. The API never fetches them. Webhook delivery is outside the lab's scope.
