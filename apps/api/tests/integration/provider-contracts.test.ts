import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  connectipsMerchantId,
  type Provider,
  type ScenarioKey,
} from "@nepal-payment-lab/shared";
import { z } from "zod";
import {
  apiSuite,
  body,
  complete,
  credentials,
  initiate,
  verification,
} from "./support";

// Expectations come from the linked provider contracts and documented lab
// differences, independently of the production status-formatting helpers.
const cases = [
  {
    key: "normal-completion",
    redirect: "completed",
    khalti: "Completed",
    khaltiHttp: 200,
    esewa: "COMPLETE",
    ips: "SUCCESS",
    ipsDesc: "TRANSACTION SUCCESSFUL",
    amount: 120000,
  },
  {
    key: "pending-payment",
    redirect: "pending",
    khalti: "Pending",
    khaltiHttp: 200,
    esewa: "PENDING",
    ips: "ERROR",
    ipsDesc: "TRANSACTION INCOMPLETE",
    amount: 120000,
  },
  {
    key: "user-cancellation",
    redirect: "cancelled",
    khalti: "User canceled",
    khaltiHttp: 400,
    esewa: "CANCELED",
    ips: "FAILED",
    ipsDesc: "TRANSACTION UNSUCCESSFUL",
    amount: 120000,
  },
  {
    key: "completed-redirect-pending-lookup",
    redirect: "completed",
    khalti: "Pending",
    khaltiHttp: 200,
    esewa: "PENDING",
    ips: "ERROR",
    ipsDesc: "TRANSACTION INCOMPLETE",
    amount: 120000,
  },
  {
    key: "amount-mismatch",
    redirect: "completed",
    khalti: "Completed",
    khaltiHttp: 200,
    esewa: "COMPLETE",
    ips: "SUCCESS",
    ipsDesc: "TRANSACTION SUCCESSFUL",
    amount: 120001,
  },
  {
    key: "expired-payment",
    redirect: "expired",
    khalti: "Expired",
    khaltiHttp: 400,
    esewa: "NOT_FOUND",
    ips: "ERROR",
    ipsDesc: "TRANSACTION NOT FOUND",
    amount: 120000,
  },
  {
    key: "completed-redirect-cancelled-lookup",
    redirect: "completed",
    khalti: "User canceled",
    khaltiHttp: 400,
    esewa: "CANCELED",
    ips: "FAILED",
    ipsDesc: "TRANSACTION UNSUCCESSFUL",
    amount: 120000,
  },
  {
    key: "completed-redirect-expired-lookup",
    redirect: "completed",
    khalti: "Expired",
    khaltiHttp: 400,
    esewa: "NOT_FOUND",
    ips: "ERROR",
    ipsDesc: "TRANSACTION NOT FOUND",
    amount: 120000,
  },
] satisfies {
  key: ScenarioKey;
  redirect: string;
  khalti: string;
  khaltiHttp: number;
  esewa: string;
  ips: string;
  ipsDesc: string;
  amount: number;
}[];

const signedReturn = z
  .object({
    transaction_code: z.string(),
    status: z.string(),
    total_amount: z.string(),
    transaction_uuid: z.string(),
    product_code: z.string(),
    signed_field_names: z.string(),
    signature: z.string(),
  })
  .strict();

describe.each(["khalti", "esewa", "connectips"] satisfies Provider[])(
  "%s provider contract",
  (provider) => {
    const api = apiSuite();

    test("accepted initiation exposes an unused checkout and initial verification state", async () => {
      const credential = await credentials(api(), { provider });
      const payment = await initiate(api(), { provider, credential });
      const checkout = await api().request(`/v1/checkout/${payment.token}`);
      expect(checkout.status).toBe(200);
      expect(checkout.headers.get("Cache-Control")).toBe("no-store");
      const data = await body(checkout);
      expect(data).toMatchObject({
        provider,
        orderId: "ORDER-001",
        amountMinor: 120000,
        scenarioKey: "normal-completion",
        used: false,
        returnHost: "merchant.test",
      });
      const remaining =
        Date.parse(z.string().parse(data.expiresAt)) - Date.now();
      const lifetime =
        provider === "esewa" ? 300 : provider === "khalti" ? 1800 : 3600;
      expect(remaining).toBeGreaterThan(lifetime * 1000 - 10000);
      expect(remaining).toBeLessThanOrEqual(lifetime * 1000);
      const result = await verification(api(), payment);
      expect(result.status).toBe(200);
      expect((await body(result)).status).toBe(
        provider === "khalti"
          ? "Pending"
          : provider === "esewa"
            ? "PENDING"
            : "ERROR",
      );
    });

    test.each(cases)(
      "$key preserves the provider's return and verification contract",
      async (scenario) => {
        const credential = await credentials(api(), { provider });
        const payment = await initiate(api(), {
          provider,
          credential,
          scenario: scenario.key,
        });
        const response = await complete(api(), payment, scenario.key);
        expect(response.status).toBe(303);
        const location = response.headers.get("Location");
        if (!location)
          throw new Error("Checkout did not return a merchant destination.");
        const destination = new URL(location);
        expect(destination.searchParams.get("existing")).toBe("keep");
        const completedReturn = scenario.redirect === "completed";
        expect(destination.pathname).toBe(
          provider === "khalti" || completedReturn ? "/success" : "/failure",
        );

        let transaction: string | null = null;
        if (provider === "khalti") {
          const statuses: Record<string, string> = {
            completed: "Completed",
            pending: "Pending",
            cancelled: "User canceled",
            expired: "Expired",
          };
          expect(Object.fromEntries(destination.searchParams)).toMatchObject({
            pidx: payment.pidx,
            amount: "120000",
            total_amount: "120000",
            status: statuses[scenario.redirect],
            purchase_order_id: "ORDER-001",
            purchase_order_name: "Test order",
          });
          transaction = destination.searchParams.get("transaction_id");
          expect(destination.searchParams.get("tidx")).toBe(transaction);
          expect(transaction).toEqual(
            completedReturn ? expect.stringMatching(/^lab_txn_/) : "",
          );
        } else if (provider === "esewa") {
          const encoded = destination.searchParams.get("data");
          if (!encoded) throw new Error("eSewa return has no signed data.");
          const data = signedReturn.parse(
            JSON.parse(Buffer.from(encoded, "base64").toString("utf8")),
          );
          expect(data).toMatchObject({
            total_amount: "1200",
            transaction_uuid: "ORDER-001",
            product_code: credential.key.prefix,
            status: completedReturn
              ? "COMPLETE"
              : scenario.redirect === "pending"
                ? "PENDING"
                : "CANCELED",
            signed_field_names:
              "transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names",
          });
          const message =
            "transaction_code=" +
            data.transaction_code +
            ",status=" +
            data.status +
            ",total_amount=" +
            data.total_amount +
            ",transaction_uuid=" +
            data.transaction_uuid +
            ",product_code=" +
            data.product_code +
            ",signed_field_names=" +
            data.signed_field_names;
          expect(data.signature).toBe(
            createHmac("sha256", credential.secret)
              .update(message)
              .digest("base64"),
          );
          transaction = data.transaction_code;
          expect(transaction).toEqual(
            completedReturn ? expect.stringMatching(/^lab_txn_/) : "",
          );
        } else {
          expect(Object.fromEntries(destination.searchParams)).toEqual({
            existing: "keep",
            TXNID: "ORDER-001",
          });
        }

        const lookup = await verification(api(), payment);
        expect(lookup.status).toBe(
          provider === "khalti" ? scenario.khaltiHttp : 200,
        );
        const result = await body(lookup);
        if (provider === "khalti") {
          expect(result).toEqual({
            pidx: payment.pidx,
            total_amount: scenario.amount,
            status: scenario.khalti,
            transaction_id:
              scenario.khalti === "Completed" ? transaction : null,
            fee: 0,
            refunded: false,
          });
        } else if (provider === "esewa") {
          expect(result).toEqual({
            product_code: credential.key.prefix,
            transaction_uuid: "ORDER-001",
            total_amount: scenario.amount / 100,
            status: scenario.esewa,
            ref_id: ["COMPLETE", "CANCELED"].includes(scenario.esewa)
              ? expect.stringMatching(/^lab_txn_/)
              : null,
          });
        } else {
          expect(result).toEqual({
            merchantId: Number(connectipsMerchantId(credential.key.prefix)),
            appId: credential.key.prefix,
            referenceId: "ORDER-001",
            txnAmt: String(scenario.amount),
            token: null,
            status: scenario.ips,
            statusDesc: scenario.ipsDesc,
          });
          const detailsResponse = await verification(api(), payment, {
            details: true,
          });
          expect(detailsResponse.status).toBe(200);
          expect(await body(detailsResponse)).toEqual({
            ...result,
            txnAmt: scenario.amount,
            debitBankCode: "9999",
            txnId: expect.any(Number),
            batchId: expect.any(Number),
            txnDate: expect.any(Number),
            txnCrncy: null,
            chargeAmt: 0,
            chargeLiability: "CG",
            refId: "REF-001",
            remarks: "Local test",
            particulars: "Test payment",
            creditStatus: scenario.ips === "SUCCESS" ? "000" : "FAILED",
          });
        }
        const repeat = await verification(api(), payment);
        expect(await body(repeat)).toEqual(result);
      },
    );

    test.each([
      "invalid-payment-id",
      "lookup-server-error",
    ] satisfies ScenarioKey[])(
      "%s returns the provider's error body",
      async (scenario) => {
        const credential = await credentials(api(), { provider });
        const payment = await initiate(api(), { provider, credential });
        await complete(api(), payment, scenario);
        const response = await verification(api(), payment);
        const result = await body(response);
        if (scenario === "lookup-server-error") {
          expect(response.status).toBe(500);
          expect(result).toEqual(
            provider === "khalti"
              ? { detail: "Internal server error." }
              : provider === "esewa"
                ? { code: 0, error_message: "Service is currently unavailable" }
                : { status: "ERROR", statusDesc: "Internal server error." },
          );
        } else {
          expect(response.status).toBe(provider === "khalti" ? 404 : 200);
          if (provider === "khalti")
            expect(result).toEqual({
              detail: "Not found.",
              error_key: "validation_error",
            });
          else if (provider === "esewa")
            expect(result).toEqual({
              product_code: credential.key.prefix,
              transaction_uuid: "ORDER-001",
              total_amount: 1200,
              status: "NOT_FOUND",
              ref_id: null,
            });
          else
            expect(result).toMatchObject({
              status: "ERROR",
              statusDesc: "TRANSACTION NOT FOUND",
              txnAmt: "120000",
            });
        }
      },
    );
  },
);
