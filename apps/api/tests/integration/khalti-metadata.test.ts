import { expect, test } from "bun:test";
import { z } from "zod";
import { apiSuite, body, complete, credentials } from "./support";

const api = apiSuite();

test("Khalti metadata survives payment creation and checkout with a large breakdown", async () => {
  const credential = await credentials(api(), { provider: "khalti" });
  const response = await api().request("/khalti/api/v2/epayment/initiate/", {
    method: "POST",
    headers: {
      Authorization: `Key ${credential.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      return_url: "http://merchant.test/success?existing=keep",
      website_url: "http://merchant.test",
      amount: 1010,
      amount_breakdown: Array.from({ length: 101 }, () => ({
        label: "Item",
        amount: 10,
      })),
      purchase_order_id: "METADATA-001",
      purchase_order_name: "Metadata order",
      merchant_extra: " cart & + नेपाली ",
      merchant_cart: { reference: "cart-42" },
      customer_info: { name: "Test payer" },
      unrelated: "do not retain",
    }),
  });
  expect(response.status).toBe(200);
  const initiated = await body(response);
  expect(initiated).not.toHaveProperty("merchant_extra");
  expect(initiated).not.toHaveProperty("merchant_cart");
  expect(initiated).not.toHaveProperty("customer_info");
  expect(initiated).not.toHaveProperty("unrelated");

  const checkoutUrl = z.string().parse(initiated.payment_url);
  const token = new URL(checkoutUrl).pathname.split("/").at(-1);
  if (!token) throw new Error("Checkout token missing.");
  const completed = await complete(api(), { token });
  expect(completed.status).toBe(303);
  const location = completed.headers.get("Location");
  if (!location) throw new Error("Merchant return missing.");
  const query = new URL(location).searchParams;
  expect(query.get("merchant_extra")).toBe(" cart & + नेपाली ");
  expect(query.get("merchant_cart")).toBe("[object Object]");
  expect(query.get("existing")).toBe("keep");
  expect(query.get("status")).toBe("Completed");
  expect(query.has("customer_info")).toBe(false);
  expect(query.has("unrelated")).toBe(false);

  const lookup = await api().request("/khalti/api/v2/epayment/lookup/", {
    method: "POST",
    headers: {
      Authorization: `Key ${credential.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pidx: initiated.pidx }),
  });
  expect(lookup.status).toBe(200);
  expect(await body(lookup)).toMatchObject({
    pidx: initiated.pidx,
    total_amount: 1010,
    status: "Completed",
  });
});
