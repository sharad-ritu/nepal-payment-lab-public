# Sandbox comparison

Checked on 2026-10-31 against the official Khalti, eSewa, connectIPS, and NPX sandboxes. Lab behavior was first read from the provider routes and contracts in `apps/api/src/modules`. After the fixes, the same requests were replayed against a local lab, and every row marked Fixed now matches. Sixteen sandbox requests covered initiation, status checks for initiated and unknown payments, and error responses.

A Khalti payment was also completed in the sandbox to compare the browser return and lookup. The other providers' completed flows need a human login step and are listed at the end. Sandbox behavior can differ from production.

## Summary

| Provider | Matches | Differences found |
| --- | --- | --- |
| Khalti | Initiate shape, lookup shape, invalid-key response | Fixed: lookup status for an unpaid payment, unknown-pidx HTTP code, minimum amount, metadata echo, expiry |
| eSewa | Status responses for pending and unknown transactions | Fixed: form redirect code, invalid-signature error body |
| connectIPS | `validatetxn` not-found response | Fixed: `gettxndetail` not-found shape, 401 body |
| NPX | `GetProcessId`, duplicate record, uninitialized status (exact) | Fixed: instrument fields |

## Khalti

| Case | Sandbox | Lab | Action |
| --- | --- | --- | --- |
| Lookup of an initiated, unvisited payment | 200, `status: "Pending"` | 200, `status: "Pending"` | Fixed |
| Lookup of an unknown `pidx` | **404** `{detail: "Not found.", error_key: "validation_error"}` | 404, same body | Fixed |
| Minimum amount | Rejects below 100 paisa: `"Amount should be greater than Rs. 1 that is 100 paisa."` | Rejects below 100 paisa with the sandbox message | Fixed |
| `merchant_*` fields in initiate response | Not echoed (sent `merchant_extra`) | Not echoed | Fixed |
| `expires_in` / `expires_at` | 1800 seconds; `+05:45` offset | 1800 seconds; `+05:45` offset | Fixed |
| Invalid key | 401 `{detail: "Invalid token.", status_code: 401}` | Same | Matches |
| Initiate success shape | `pidx`, `payment_url`, `expires_at`, `expires_in` | Same fields | Matches |
| Lookup body fields | `pidx`, `total_amount` (number), `status`, `transaction_id`, `fee`, `refunded` | Same | Matches |

### Khalti completed payment

Paid in the sandbox with the test wallet, then looked up.

| Case | Sandbox | Lab | Action |
| --- | --- | --- | --- |
| Return field order | `pidx`, `transaction_id`, `tidx`, `txnId`, `amount`, `total_amount`, `mobile`, `status`, `purchase_order_id`, `purchase_order_name`, then `merchant_*` | Same | Fixed |
| `txnId` alias | Present, equal to `transaction_id` | Present | Fixed |
| `mobile` | Masked: `98XXXXX001` | Masked: `98XXXXX000` | Fixed |
| Non-string `merchant_*` value | `{"ref": "c1"}` returned as `[object Object]` | Same `String()` conversion | Fixed |
| Lookup after payment | `status: "Completed"`, `transaction_id` set, `fee: 30` | Same, with `fee: 0` | Fee value is synthetic; documented |

## eSewa

| Case | Sandbox | Lab | Action |
| --- | --- | --- | --- |
| Valid form post | **302** to the eSewa login page | 302 to the lab checkout | Fixed |
| Invalid signature | 400 `{code: "ES104", message: "Invalid payload signature."}` | Same | Fixed |
| Status after form post, unpaid | 200 `PENDING`, `total_amount: 100` (number), `ref_id: null` | Same | Matches |
| Status of an unknown UUID | 200 `NOT_FOUND`, same fields | Same | Matches |

## connectIPS

| Case | Sandbox | Lab | Action |
| --- | --- | --- | --- |
| `validatetxn`, unknown transaction | 200 `{merchantId: <number>, appId, referenceId, txnAmt: "1000", token: null, status: "ERROR", statusDesc: "TRANSACTION NOT FOUND"}` | Same fields and types | Matches |
| `gettxndetail`, unknown transaction | 200 with every detail field present, mostly `null`. `merchantId` and `appId` are set, `referenceId` is `null`, and **`refId` holds the requested reference**. | Same shape | Fixed |
| Wrong Basic-auth password | 401, **plain text** `HTTP Status 401 : Bad credentials`, no content type | Same plain-text body | Fixed |

The success-path `gettxndetail` mapping (`referenceId` compared with `refId`) still needs a completed sandbox payment to confirm.

## NPX OnePG

| Case | Sandbox | Lab | Action |
| --- | --- | --- | --- |
| `GetProcessId` | `{code: "0", message: "Process Id generated successfully", errors: [], data: {ProcessId: "36EC884C_28A2_..."}}` | Same message, format, and ID pattern | Matches |
| Duplicate `MerchantTxnId` | `code: "1"`, `Duplicate Record`, `error_code: "1"`, `data: null` | Same | Matches |
| `CheckTransactionStatus` before gateway form | `code: "1"`, `error_code: "3"`, `Transaction not initialized yet` | Same | Matches |
| `GetPaymentInstrumentDetails` item | Includes `InstrumentValue: null` and `BankUrl` (`"MBanking"` for TMBANK) | Same fields for TMBANK | Fixed |

The sandbox's TMBANK entry matches the lab's synthetic instrument code and `BankType`.

## Not yet compared

These need a human step in the sandbox, so the lab follows the official documentation for them:

- eSewa completed payment and signed `data`: the sandbox login is protected by reCAPTCHA.
- NPX completed payment and receipt: the sandbox test bank (`testbank.nepalpayment.com`) needs a login that is not published.
- connectIPS completed payment: the UAT gateway needs a test bank login.
- NPX `GetServiceCharge`.
