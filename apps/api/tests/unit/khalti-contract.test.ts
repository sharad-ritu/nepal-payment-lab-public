import { expect, test } from "bun:test";
import {
  initiationSchema,
  khaltiTimestamp,
  merchantReturn,
} from "../../src/modules/khalti/contract";
import { paymentFixture } from "../fixtures";

const initiation = {
  return_url: "http://merchant.test/success?existing=keep",
  website_url: "http://merchant.test",
  amount: 1010,
  purchase_order_id: "ORDER-001",
  purchase_order_name: "Test order",
};

test.each(["return_url", "website_url"])(
  "Khalti rejects malformed %s without throwing",
  (field) => {
    for (const url of [
      "not a url",
      "http://[invalid]/return",
      "https://",
      "file:///tmp/return",
      "https://user:password@merchant.test/return",
    ]) {
      const result = initiationSchema.safeParse({
        ...initiation,
        [field]: url,
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues).toEqual([
        expect.objectContaining({
          path: [field],
          message: "Enter a valid URL.",
        }),
      ]);
    }
  },
);

test("Khalti accepts more than 100 breakdown entries while enforcing their sum", () => {
  const amount_breakdown = Array.from({ length: 101 }, () => ({
    label: "Item",
    amount: 10,
  }));
  expect(
    initiationSchema.safeParse({ ...initiation, amount_breakdown }).success,
  ).toBe(true);
  expect(
    initiationSchema.safeParse({
      ...initiation,
      amount: 1011,
      amount_breakdown,
    }).success,
  ).toBe(false);
});

test("Khalti retains only merchant-prefixed metadata and encodes successful returns", () => {
  const merchantMetadata = {
    merchant_extra: " cart & + नेपाली ",
    merchant_count: 2,
    merchant_enabled: false,
    merchant_optional: null,
    merchant_items: ["first", "second"],
    merchant_cart: { reference: "cart-42" },
  };
  const parsed = initiationSchema.parse({
    ...initiation,
    ...merchantMetadata,
    customer_info: { name: "Test payer" },
    unrelated: "do not retain",
    merchantMetadata: { merchant_extra: "spoofed" },
  });
  expect(parsed.merchantMetadata).toEqual(merchantMetadata);

  const result = merchantReturn(
    paymentFixture({
      providerDetails: { merchantMetadata: parsed.merchantMetadata },
    }),
  );
  const query = new URL(result.url).searchParams;
  expect(query.get("merchant_extra")).toBe(" cart & + नेपाली ");
  expect(query.get("merchant_count")).toBe("2");
  expect(query.get("merchant_enabled")).toBe("false");
  expect(query.get("merchant_optional")).toBe("null");
  expect(query.get("merchant_items")).toBe("first,second");
  expect(query.get("merchant_cart")).toBe("[object Object]");
  expect(query.get("existing")).toBe("keep");
  expect(query.get("status")).toBe("Completed");
  expect(query.has("customer_info")).toBe(false);
  expect(query.has("unrelated")).toBe(false);
});

test("Khalti metadata objects with own toString keys still return successfully", () => {
  const result = merchantReturn(
    paymentFixture({
      providerDetails: {
        merchantMetadata: {
          merchant_object: { toString: null },
          merchant_list: [{ toString: "x" }, null, 3],
        },
      },
    }),
  );
  const query = new URL(result.url).searchParams;
  expect(query.get("merchant_object")).toBe("[object Object]");
  expect(query.get("merchant_list")).toBe("[object Object],,3");
});

test("Khalti payments created before metadata support can still return successfully", () => {
  const result = merchantReturn(paymentFixture({ providerDetails: null }));
  const query = new URL(result.url).searchParams;
  expect(query.get("transaction_id")).toBe("lab_txn_fixture");
  expect(query.get("status")).toBe("Completed");
});

test("Khalti completed returns follow the sandbox field order and aliases", () => {
  const result = merchantReturn(paymentFixture({ providerDetails: null }));
  const query = new URL(result.url).searchParams;
  expect([...query.keys()].filter((key) => key !== "existing")).toEqual([
    "pidx",
    "transaction_id",
    "tidx",
    "txnId",
    "amount",
    "total_amount",
    "mobile",
    "status",
    "purchase_order_id",
    "purchase_order_name",
  ]);
  expect(query.get("txnId")).toBe("lab_txn_fixture");
  expect(query.get("mobile")).toBe("98XXXXX000");
});

test("Khalti timestamps use Nepal time with microsecond precision", () => {
  expect(khaltiTimestamp(new Date("2026-10-31T04:54:25.696Z"))).toBe(
    "2026-10-31T10:39:25.696000+05:45",
  );
});
