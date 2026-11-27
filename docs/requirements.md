# Project requirements

Nepal Payment Lab is a controllable fake Khalti, eSewa, connectIPS, and NPX OnePG web-checkout provider for local development and integration testing. It never contacts the live providers or moves money.

NPX is the current brand of [Nepal Payment Solution Limited](https://nepalpayment.com/en/company-profile). The supplied 2025 OnePG guide uses its older abbreviation, NPS. Use NPX in app copy and maintained documentation. Preserve the `nps` provider ID, `/nps/` routes, and existing `NPS_*` environment examples.

## Developer workflow

1. Start the local app with `docker compose up --build --wait`, open the dashboard, select a provider, and generate lab credentials.
2. Copy the lab endpoints and credentials into the merchant application. Reuse one provider credential across local applications. For connectIPS and NPX, also save the URLs the live provider team would register during onboarding.
3. Save an initiation response on the dashboard to exercise failures before checkout.
4. Initiate a payment through the merchant application and choose a scenario on the lab checkout page.
5. Return to the merchant application and verify the payment through the provider's confirmation endpoint.

The dashboard has Connection, Integration, and Scenarios views. Connection holds credentials and initiation controls. Integration provides request examples and official documentation links. Scenarios compares browser returns with verification results. Keep the UI simple, responsive, and keyboard accessible, using the existing teal and mint palette.

## Accounts and payments

- Each local installation has one shared workspace with one account per provider and at most one credential for that account. The dashboard has no login or user ownership. Docker exposes services only on the loopback interface.
- Credentials can be displayed, copied, replaced, and revoked. Replacement and revocation preserve account settings and retained payments, and affect every application using those credentials.
- An initiation response applies to every new request for that provider account until changed. Choices are acceptance, validation failure, authentication failure, server failure, and connection timeout. Failed initiation creates no payment or checkout link.
- Each accepted Khalti request creates a distinct payment, including repeated merchant order IDs. eSewa transaction UUIDs, connectIPS TXNIDs, and NPX MerchantTxnIds must be unique within their provider account during retention. Duplicate checks and creation must be atomic.
- Checkout is single-use. Save the selected browser return and verification outcome before redirecting. Later settings changes and other payments must not alter it.
- The optional lab-only `Payment-Lab-Scenario` header preselects a checkout scenario. It does not skip checkout or override initiation settings.
- Scenarios cover success, pending, cancellation, expiry, amount mismatch, unknown payment, verification timeout, server failure, and success redirects followed by pending, canceled, or expired verification.
- Unused and pending payments can expire. Completed and canceled outcomes stay stable during the seven-day retention window. Reads enforce retention, and periodic cleanup deletes older payments.
- Merchant applications must verify status, identifiers, and amount before marking an order paid. A browser return or HTTP 200 alone is insufficient.

## Provider contracts and official documentation

Implement the documented web-checkout subset with the provider's method, content type, field casing, authentication, amount units, signature rules, return parameters, and response vocabulary. Keep provider responses separate from dashboard error responses. The dashboard integration guides explain how to point an existing provider integration at the lab using environment values and registered callback URLs. Request and signing code stays unchanged.

### Khalti KPG-2

Official reference: [Web Checkout, initiation, browser return, and lookup](https://docs.khalti.com/khalti-epayment/).

| Method | Lab endpoint |
| --- | --- |
| POST | `/khalti/api/v2/epayment/initiate` |
| POST | `/khalti/api/v2/epayment/lookup` |

Use JSON, `Authorization: Key <lab secret>`, and integer paisa of at least 100. Checkout expires after 30 minutes. Save the returned `pidx` and use it for lookup. Initiation reports `expires_at` in Nepal time (`+05:45`). Lookup reports an unpaid payment as `Pending`, and a missing payment returns HTTP 404. Only `Completed` means paid. The current credential can verify retained payments after replacement; revoked credentials fail authentication.

Retain JSON fields whose names start with `merchant_` and echo them in the completed browser return. The initiation response does not echo them. Preserve string metadata exactly; convert other JSON values with JavaScript `String()` semantics in browser query parameters, as the sandbox does (objects become `[object Object]`). Keep metadata separate from the standard payment fields and discard customer and product details. Retained payments created without metadata remain usable. Amount breakdowns must sum to the requested amount, with no separate item-count limit beyond the request body-size limit.

### eSewa ePay

Official reference: [ePay form, HMAC signatures, browser response, and status check](https://developer.esewa.com.np/pages/Epay).

| Method | Lab endpoint |
| --- | --- |
| POST | `/esewa/api/epay/main/v2/form` |
| GET | `/esewa/api/epay/transaction/status` |

Use a URL-encoded form with decimal rupee strings, the lab product code, and ordered Base64 HMAC-SHA256 signatures. Accepted forms redirect with HTTP 302; invalid signatures return HTTP 400 with `{"code": "ES104", "message": "Invalid payload signature."}`. Checkout expires after five minutes. Browser returns carry Base64 JSON in `data`; verify its signature and then check status. Only `COMPLETE` means paid.

Signed browser responses preserve `total_amount` as text, following the official encoded example. Status responses use numeric rupees. Sign and verify the received field text without numeric normalization. Status checks require no authentication and resolve retained payments by their original product code and UUID, including after credential replacement or revocation. New forms and signed checkout completion require a current credential.

### connectIPS Gateway

Official references:

- [Merchant form and browser return](https://doc.connectips.com/docs/connectIPS-Gateway/merchant-interface)
- [Payment validation](https://doc.connectips.com/docs/connectIPS-Gateway/payment-validation)
- [Transaction details](https://doc.connectips.com/docs/connectIPS-Gateway/txn_details)
- [Validation and detail response codes](https://doc.connectips.com/docs/connectIPS-Gateway/validateTxn-getTxnDetail)
- [Exceptions and duplicate transactions](https://doc.connectips.com/docs/connectIPS-Gateway/exception)

| Method | Lab endpoint |
| --- | --- |
| POST | `/connectips/connectipswebgw/loginpage` |
| POST | `/connectips/connectipswebws/api/creditor/validatetxn` |
| POST | `/connectips/connectipswebws/api/creditor/gettxndetail` |

Register Success URL and Failure URL in the connectIPS Connection view before posting the gateway form, as merchants register them with NCHL during onboarding. The form carries no return destination; unknown fields such as `SUCCESSURL` and `FAILUREURL` are ignored. Forms are rejected with a validation error until both URLs are saved, after initiation responses are applied. Each payment captures the registered URLs when it is created; later changes affect only new payments. Completed outcomes return to the Success URL and all others to the Failure URL.

Use a URL-encoded gateway form and integer paisa. Validation and transaction details use JSON with Basic authentication, the lab app ID as username, and the lab secret as password. Checkout expires after 60 minutes. Browser returns append `TXNID`; only verification status `SUCCESS` means paid. Validation returns `txnAmt` as text, while transaction details return a number, following their respective official examples. Credential replacement changes merchant/app identifiers; verification requires current identifiers and credentials. Basic-auth failures return HTTP 401 with the plain-text body `HTTP Status 401 : Bad credentials` and no content type. Transaction details for a missing transaction return every receipt field, with `null` values except `merchantId`, `appId`, and `refId`, which echoes the requested reference.

Transaction details use `creditStatus: "000"` for successful outcomes and the lab-only value `"FAILED"` for unsuccessful outcomes. NCHL classifies `000`, `999`, and `DEFER` as successful credit statuses, so none can represent an unsuccessful lab outcome. The top-level `status` and `statusDesc` still distinguish failed, incomplete, and missing transactions.

### NPX OnePG gateway

The simulator follows the 2025 OnePG developer guide supplied by NPX. For public endpoint and schema documentation, see the [official NPX API reference](https://apigateway.nepalpayment.com/Help).

| Method | Lab endpoint |
| --- | --- |
| POST | `/nps/GetPaymentInstrumentDetails` |
| POST | `/nps/GetServiceCharge` |
| POST | `/nps/GetProcessId` |
| POST | `/nps/Payment/Index` |
| POST | `/nps/CheckTransactionStatus` |

The four JSON APIs require Basic authentication with the lab API username/password and a `Signature`. Sort every payload key except `Signature` alphabetically, concatenate the raw string values, and compute lowercase hexadecimal HMAC-SHA512 with the secret key. Preserve decimal rupee text when signing. Request fields use `MerchantId`, `MerchantName`, `Amount`, and `MerchantTxnId` as applicable. Envelopes use lowercase `code`, `message`, `errors`, and `data`; codes are strings `"0"` and `"1"`.

Register the default Response URL in the NPX Connection view before creating a process. `GetProcessId` returns only `data.ProcessId`; duplicate merchant references return `code: "1"`, `Duplicate Record`, and `data: null`. Apply initiation failures and the lab scenario header to this call. Creating a process does not open or consume checkout.

Submit the process to `Payment/Index` as multipart form data. The form does not require Basic authentication or a signature. Merchant identity, transaction ID, amount, and ProcessId must match the process. Optional `InstrumentCode`, `TransactionRemarks`, and `ResponseUrl` select the instrument, add receipt remarks, and override the browser destination. The default response URL is captured at process creation. Gateway details become immutable after the first accepted form; repeated forms with matching gateway details can reopen an unused checkout, and differing form details are rejected. Checkout is unavailable before an accepted gateway form.

The browser return carries `MerchantTxnId` and `GatewayTxnId`, preserving existing query parameters. It carries no trustworthy payment status, amount, signature, or authentication. Call the signed `CheckTransactionStatus` API and check the transaction IDs and rupee amount before marking an order paid. The lab does not send NPX webhooks.

Only `code: "0"` with `data.Status: "Success"` means paid. `Fail` and `Pending` are distinct valid receipt states. Receipts include string `Amount`, `GatewayReferenceNo`, `ProcessId`, merchant reference, fee, remarks, date, institution, and instrument. Unknown or uninitialized transactions use the documented error code `"3"` and `Transaction not initialized yet`. Authenticated status checks are scoped to the provider account; replacement credentials can verify retained payments using their current merchant identity, while old or revoked credentials fail.

Checkout saves the selected outcome before returning to the merchant. Response URL changes and credential changes do not alter a saved process.

## Intentional lab differences and limits

- Hostnames, credentials, provider IDs, receipts, and checkout pages are synthetic. Every checkout clearly states that no money moves. Real provider credentials are not accepted.
- HTTP or HTTPS browser return URLs are accepted, including localhost, without live-provider registration. connectIPS and NPX require lab-side URL registration in the dashboard to simulate their registered destinations. Reject embedded URL credentials. Merchant destinations are never fetched by the API.
- connectIPS `APPNAME` is required and accepts up to 30 characters. The dashboard's `CONNECTIPS_APP_NAME` is a labeled example; merchants can retain their existing app name. `TOKEN` is required but RSA certificate verification is outside the lab. NCHL's [merchant interface](https://doc.connectips.com/docs/connectIPS-Gateway/merchant-interface) documents the private key in a PFX/keystore and names `CREDITOR.pfx` for testing. The signing private key generates `TOKEN` from the transaction details. Merchants keep their existing token-generation code and test key configuration unchanged, whether they use `CREDITOR.pfx`, PEM, a base64-encoded key, or another keystore. Generate each `TOKEN` using the lab merchant and app IDs in the request. No lab-specific private key or certificate is needed. The lab app password is only for Basic authentication and is separate from the signing key and keystore password. Lab app IDs may exceed the live limit.
- connectIPS uses the synthetic credit-status value `FAILED` for unsuccessful detail receipts because the public gateway reference does not specify a concrete failure credit code. This value is a simulator convention, not a claimed NCHL code.
- Khalti's public reference does not specify metadata value types or browser serialization. The lab accepts JSON `merchant_*` values, omits them from initiation responses, and stringifies non-string values on completed browser returns, matching the sandbox. Provider JSON bodies remain limited to 16 KiB.
- Khalti completed browser returns include `transaction_id`, `tidx`, and the `txnId` alias, in the sandbox's field order, with a masked payer number such as `98XXXXX000`. Lookup reports `fee: 0`; the sandbox reports a real fee.
- connectIPS form acceptance redirects to the lab checkout with HTTP 303. eSewa attaches signed `data` on both success and failure returns. Expiry maps to `NOT_FOUND` for eSewa status and transaction-not-found for connectIPS validation.
- No eSewa scenario returns `AMBIGUOUS`.
- NPX uses the same lab secret as its Basic-auth password and HMAC secret, and derives merchant identity from the credential prefix. It exposes a synthetic Test Bank/TMBANK instrument with no logo and a fixed NPR 5 fee. Processes expire after 60 minutes. The sample HTML's URL-encoded gateway form is accepted alongside the documented multipart form. Unknown instruments are rejected. Amounts are capped at 999999999.99 rupees, status Amount uses canonical decimal text, and receipt dates use UTC. Unsupported-input error text and HTTP failure status codes are lab behavior because the supplied guideline does not define them. Webhook delivery is outside the lab's scope.
- NPX maps simulated cancellation/expiry to `Fail` and missing payments to the documented error code `3`. Browser return IDs remain the same across outcomes; conflicting-return scenarios retain their chosen verification outcome without inventing a browser status field.
- Fault injection, contradictory return/verification scenarios, timeout duration, undocumented failure bodies, amount limits, and amount-mismatch rejection are lab rules. eSewa/connectIPS verification must match the original amount before applying a saved scenario's reported amount change.
- Keep secrets, checkout tokens, signatures, customer details, and payment payloads out of logs and browser persistent storage. Store checkout tokens as digests. Store lab secrets only for dashboard display, authentication, eSewa signing, and NPX HMAC verification.
- Projects, run reports, replay, operation payload logs, merchant confirmations, refunds, mobile SDKs, webhooks, and other provider products are outside scope. Keep the existing web/API/shared/database boundaries without adding a provider framework.

The contracts were reviewed against these official documents on 2026-10-02 and compared with the official sandboxes on 2026-10-31, as recorded in the [sandbox comparison](sandbox-comparison.md). Completed eSewa, connectIPS, and NPX payments and production gateways have not been compared. Local setup is in the [README](../README.md); contributor rules remain in [AGENTS.md](../AGENTS.md) and `docs/agents`.
