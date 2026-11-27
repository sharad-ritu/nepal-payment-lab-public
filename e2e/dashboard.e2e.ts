import { expect, type Route, test } from "@playwright/test";
import type { Provider } from "../packages/shared/src";
import {
  createPayment,
  merchantReturn,
  replaceKey,
  seedProvider,
  verifyPayment,
  webOrigin,
} from "./support";

for (const provider of [
  "khalti",
  "esewa",
  "connectips",
  "nps",
] satisfies Provider[]) {
  test(`${provider} completes checkout, returns to the merchant, and verifies payment`, async ({
    page,
  }) => {
    const credential = await seedProvider(page, provider);
    const payment = await createPayment(page, provider, credential);
    await merchantReturn(page);
    await page.goto(payment.checkoutUrl);
    await expect(
      page.getByText("Test environment. No real money moves."),
    ).toBeVisible();
    await expect(page.getByLabel("Payment outcome")).toContainText(
      provider === "nps" ? "Verified success" : "Full success",
    );
    await page
      .getByRole("button", { name: "Return to app", exact: true })
      .click();
    await expect(page).toHaveURL(/^http:\/\/merchant\.test\/return\?/);
    const result = await verifyPayment(page, payment);
    if (provider === "nps") {
      expect(result).toMatchObject({
        code: "0",
        data: {
          Status: "Success",
          Amount: "1200",
          MerchantTxnId: payment.orderId,
          ProcessId: payment.pidx,
        },
      });
    } else {
      expect(result.status).toBe(
        provider === "khalti"
          ? "Completed"
          : provider === "esewa"
            ? "COMPLETE"
            : "SUCCESS",
      );
      expect(
        provider === "esewa"
          ? result.total_amount
          : provider === "khalti"
            ? result.total_amount
            : result.txnAmt,
      ).toBe(
        provider === "esewa" ? 1200 : provider === "khalti" ? 120000 : "120000",
      );
    }
    await page.goto(payment.checkoutUrl);
    await expect(
      page.getByText("Checkout already used", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Return to app", exact: true }),
    ).toHaveCount(0);
  });
}

test("a success browser return can coexist with pending verification", async ({
  page,
}) => {
  const credential = await seedProvider(page);
  const payment = await createPayment(
    page,
    "khalti",
    credential,
    "completed-redirect-pending-lookup",
  );
  await merchantReturn(page);
  await page.goto(payment.checkoutUrl);
  await page
    .getByRole("button", { name: "Return to app", exact: true })
    .click();
  await expect(page).toHaveURL(/status=Completed/);
  expect((await verifyPayment(page, payment)).status).toBe("Pending");
});

test("NPX checkout offers distinct outcomes and returns only transaction identifiers", async ({
  page,
}) => {
  const credential = await seedProvider(page, "nps");
  const payment = await createPayment(page, "nps", credential);
  await merchantReturn(page);
  await page.goto(payment.checkoutUrl);
  await expect(
    page.getByRole("heading", { name: "NPX test payment", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Payment outcome").click();
  await expect(page.getByRole("option")).toHaveCount(8);
  await expect(
    page.getByRole("option", { name: "Pending verification", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("option", { name: "Pending payment", exact: true })
    .click();
  await expect(
    page.getByText("Verification returns Pending.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Response URL: transaction IDs only", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Return to app", exact: true })
    .click();
  await expect(page).toHaveURL(/^http:\/\/merchant\.test\/return\?/);
  const destination = new URL(page.url());
  expect([...destination.searchParams.keys()].sort()).toEqual([
    "GatewayTxnId",
    "MerchantTxnId",
  ]);
  expect(destination.searchParams.get("MerchantTxnId")).toBe(payment.orderId);
  expect(destination.searchParams.get("GatewayTxnId")).toBeTruthy();
  expect(await verifyPayment(page, payment)).toMatchObject({
    code: "0",
    data: {
      Status: "Pending",
      Amount: "1200",
      MerchantTxnId: payment.orderId,
    },
  });
});

test("NPX checkout preserves an older preselected success-return preset", async ({
  page,
}) => {
  const credential = await seedProvider(page, "nps");
  const payment = await createPayment(
    page,
    "nps",
    credential,
    "completed-redirect-pending-lookup",
  );
  await merchantReturn(page);
  await page.goto(payment.checkoutUrl);
  await expect(page.getByLabel("Payment outcome")).toContainText(
    "Pending verification",
  );
  await page.getByLabel("Payment outcome").click();
  await expect(page.getByRole("option")).toHaveCount(9);
  await page
    .getByRole("option", { name: "Pending verification", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Return to app", exact: true })
    .click();
  await expect(page).toHaveURL(/^http:\/\/merchant\.test\/return\?/);
  expect(await verifyPayment(page, payment)).toMatchObject({
    code: "0",
    data: { Status: "Pending" },
  });
});

test("checkout outcome selection updates the failure destination and submission", async ({
  page,
}) => {
  const credential = await seedProvider(page, "esewa");
  const payment = await createPayment(page, "esewa", credential);
  await merchantReturn(page);
  await page.goto(payment.checkoutUrl);
  await page.getByLabel("Payment outcome").click();
  await page
    .getByRole("option", { name: "User cancellation", exact: true })
    .click();
  await expect(
    page.getByText("Returns to merchant-failure.test."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Return to app", exact: true })
    .click();
  await expect(page).toHaveURL(
    /^http:\/\/merchant-failure\.test\/return\?data=/,
  );
});

test("cross-site checkout submissions cannot consume a valid payment", async ({
  page,
}) => {
  const credential = await seedProvider(page);
  const payment = await createPayment(page, "khalti", credential);
  for (const headers of [
    {
      Origin: "http://another-site.test",
      "Sec-Fetch-Site": "cross-site",
    },
    {
      Origin: "null",
      "Sec-Fetch-Site": "cross-site",
    },
    {
      Origin: "null",
      Referer: "http://another-site.test/checkout",
      "Sec-Fetch-Site": "same-origin",
    },
  ]) {
    const response = await page.request.post(
      `${new URL(payment.checkoutUrl).pathname}/simulate`,
      {
        headers,
        form: { scenarioKey: "normal-completion" },
      },
    );
    expect(response.status()).toBe(403);
  }
  await page.goto(payment.checkoutUrl);
  await expect(
    page.getByRole("button", { name: "Return to app", exact: true }),
  ).toBeEnabled();
});

test("checkout accepts a null origin with same-origin Fetch Metadata", async ({
  page,
}) => {
  const credential = await seedProvider(page);
  const payment = await createPayment(page, "khalti", credential);
  const response = await page.request.post(
    `${new URL(payment.checkoutUrl).pathname}/simulate`,
    {
      headers: {
        Origin: "null",
        "Sec-Fetch-Site": "same-origin",
      },
      form: { scenarioKey: "normal-completion" },
      maxRedirects: 0,
    },
  );

  expect(response.status()).toBe(303);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  const location = response.headers().location;
  if (!location) throw new Error("Checkout did not return a merchant URL.");
  const destination = new URL(location);
  expect(`${destination.origin}${destination.pathname}`).toBe(
    "http://merchant.test/return",
  );
  expect(destination.searchParams.get("status")).toBe("Completed");
  expect((await verifyPayment(page, payment)).status).toBe("Completed");
});

test("dashboard preserves an unsaved initiation draft across tabs and saves it", async ({
  page,
}) => {
  await seedProvider(page);
  await page.goto("/dashboard?provider=khalti");
  const selection = page.getByLabel("Response for new payments");
  await selection.click();
  await page
    .getByRole("option", {
      name: "Authentication error (401)",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Integration", exact: true }).click();
  await page.getByRole("tab", { name: "Connection", exact: true }).click();
  await expect(selection).toContainText("Authentication error (401)");
  await page
    .getByRole("button", { name: "Save response", exact: true })
    .click();
  await expect(page.getByText("Response saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(selection).toContainText("Authentication error (401)");
  await selection.click();
  await page
    .getByRole("option", {
      name: "Allow initiation",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Save response", exact: true })
    .click();
  await expect(
    page.getByText("Payment initiation is blocked", { exact: true }),
  ).toHaveCount(0);
  await expect(selection).toContainText("Allow initiation");
});

test("copying credentials exposes success and clipboard failure feedback", async ({
  page,
}) => {
  const credential = await seedProvider(page);
  await page.goto("/dashboard?provider=khalti");
  await page
    .getByRole("button", { name: "Individual values", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Copy Secret key", exact: true })
    .click();
  await expect(
    page.getByText("Secret key copied.", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    credential.secret,
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async () => {
        throw new Error("Clipboard permission denied.");
      },
    });
  });
  await page
    .getByRole("button", { name: "Copy Secret key", exact: true })
    .click();
  await expect(
    page.getByText("Clipboard unavailable. Select and copy the value.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Secret key", { exact: true })).toHaveValue(
    credential.secret,
  );
});

test("environment variable renames survive tabs and reload without storing credentials", async ({
  page,
}) => {
  const credential = await seedProvider(page);
  const storageKey = "nepal-payment-lab:env-names:khalti";
  await page.evaluate((key) => localStorage.removeItem(key), storageKey);
  await page.goto("/dashboard?provider=khalti");
  await page
    .getByRole("button", { name: "Individual values", exact: true })
    .click();
  const baseUrl = await page
    .getByLabel("API base URL", { exact: true })
    .inputValue();
  const panel = page.getByRole("tabpanel");
  const variable = panel.getByLabel("Variable name for KHALTI_SECRET_KEY", {
    exact: true,
  });
  await variable.fill("SHOP_PAYMENT_SECRET");
  await variable.blur();
  const expected = `KHALTI_BASE_URL="${baseUrl}"\nSHOP_PAYMENT_SECRET="${credential.secret}"`;
  await panel
    .getByRole("button", { name: "Copy Example .env", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(expected);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
      storageKey,
    ),
  ).toEqual({ KHALTI_SECRET_KEY: "SHOP_PAYMENT_SECRET" });
  const persisted = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  expect(persisted).not.toContain(credential.secret);

  await page.getByRole("tab", { name: "Integration", exact: true }).click();
  await expect(variable).toHaveValue("SHOP_PAYMENT_SECRET");
  await panel
    .getByRole("button", { name: "Copy Example .env", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(expected);
  await page.reload();
  await expect(variable).toHaveValue("SHOP_PAYMENT_SECRET");
  const replacement = await replaceKey(page);
  await panel
    .getByRole("button", { name: "Copy Example .env", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(
      `KHALTI_BASE_URL="${baseUrl}"\nSHOP_PAYMENT_SECRET="${replacement.secret}"`,
    );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).not.toContain(replacement.secret);
  await panel.getByRole("button", { name: "Reset names", exact: true }).click();
  await expect(variable).toHaveValue("KHALTI_SECRET_KEY");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBeNull();
  await panel
    .getByRole("button", { name: "Copy Example .env", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(
      `KHALTI_BASE_URL="${baseUrl}"\nKHALTI_SECRET_KEY="${replacement.secret}"`,
    );
  await page.reload();
  await expect(variable).toHaveValue("KHALTI_SECRET_KEY");
});

test("invalid environment variable drafts and stored names fall back to defaults", async ({
  page,
}) => {
  const credential = await seedProvider(page);
  const storageKey = "nepal-payment-lab:env-names:khalti";
  for (const stored of [
    "{",
    JSON.stringify({ KHALTI_SECRET_KEY: "9INVALID" }),
  ]) {
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
      key: storageKey,
      value: stored,
    });
    await page.goto("/dashboard?provider=khalti");
    await expect(
      page.getByLabel("Variable name for KHALTI_SECRET_KEY", { exact: true }),
    ).toHaveValue("KHALTI_SECRET_KEY");
  }
  await page
    .getByRole("button", { name: "Individual values", exact: true })
    .click();
  const baseUrl = await page
    .getByLabel("API base URL", { exact: true })
    .inputValue();
  const expected = `KHALTI_BASE_URL="${baseUrl}"\nKHALTI_SECRET_KEY="${credential.secret}"`;
  const variable = page.getByLabel("Variable name for KHALTI_SECRET_KEY", {
    exact: true,
  });
  for (const draft of ["", "9INVALID"]) {
    await variable.fill(draft);
    // Copy while the invalid draft still has focus, before blur settles it.
    await page
      .getByRole("button", { name: "Copy Example .env", exact: true })
      .dispatchEvent("click");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(expected);
    await variable.blur();
    await expect(variable).toHaveValue("KHALTI_SECRET_KEY");
    expect(
      await page.evaluate((key) => localStorage.getItem(key), storageKey),
    ).toBeNull();
  }
});

test("replacement and revocation update displayed credentials even when revalidation fails", async ({
  page,
}) => {
  const initial = await seedProvider(page);
  await page.route("**/api/lab/providers/khalti", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          status: 503,
          json: { kind: "unavailable", message: "Refresh failed." },
        })
      : route.continue(),
  );
  await page.goto("/dashboard?provider=khalti");
  await page
    .getByRole("button", { name: "Individual values", exact: true })
    .click();
  await expect(page.getByLabel("Secret key", { exact: true })).toHaveValue(
    initial.secret,
  );
  const replacement = await replaceKey(page);
  expect(replacement.secret).not.toBe(initial.secret);
  await expect(page.getByLabel("Secret key", { exact: true })).toHaveValue(
    replacement.secret,
  );
  await expect(
    page.getByText("Could not refresh provider settings", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Revoke key", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Revoke key", exact: true })
    .click();
  await expect(page.getByLabel("Secret key", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Generate lab key", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Generate lab key", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Individual values", exact: true })
    .click();
  await expect(page.getByLabel("Secret key", { exact: true })).toHaveValue(
    /^lab_test_/,
  );
});

test("a late provider read cannot restore a replaced secret", async ({
  page,
}) => {
  await seedProvider(page);
  const state = await page.request.get("/api/lab/providers/khalti");
  const stale: unknown = await state.json();
  const held: { route?: Route } = {};
  let notify = () => {};
  const requested = new Promise<void>((resolve) => {
    notify = resolve;
  });
  await page.route("**/api/lab/providers/khalti", async (route) => {
    if (route.request().method() === "GET" && !held.route) {
      held.route = route;
      notify();
    } else await route.continue();
  });
  await page.goto("/dashboard?provider=khalti");
  await requested;
  await page
    .getByRole("button", { name: "Individual values", exact: true })
    .click();
  const replacement = await replaceKey(page);
  await expect(page.getByLabel("Secret key", { exact: true })).toHaveValue(
    replacement.secret,
  );
  if (!held.route) throw new Error("No provider read was intercepted.");
  try {
    await held.route.fulfill({ json: stale });
  } catch (error) {
    if (!held.route.request().failure()) throw error;
  }
  await expect(page.getByLabel("Secret key", { exact: true })).toHaveValue(
    replacement.secret,
  );
});

test("mobile provider navigation and scenario tables do not overflow the page", async ({
  page,
}) => {
  await seedProvider(page, "esewa");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard?provider=esewa");
  await expect(
    page.getByRole("heading", { name: "eSewa", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Scenarios", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Checkout scenario comparison" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("navigation", { name: "Payment providers" })
    .getByRole("link", { name: /^Khalti/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Khalti", exact: true }),
  ).toBeVisible();
});

test("clearing browser state preserves local dashboard access without persisting lab credentials", async ({
  page,
  context,
}) => {
  const credential = await seedProvider(page);
  await page.goto("/dashboard?provider=khalti");
  await page
    .getByRole("button", { name: "Individual values", exact: true })
    .click();
  await expect(page.getByLabel("Secret key", { exact: true })).toHaveValue(
    credential.secret,
  );
  const persisted = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  expect(persisted).not.toContain(credential.secret);
  await context.clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${webOrigin}/dashboard`);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page
    .getByRole("button", { name: "Individual values", exact: true })
    .click();
  await expect(page.getByLabel("Secret key", { exact: true })).toHaveValue(
    credential.secret,
  );
});

test("NPX response URL survives tabs and reload and rejects embedded credentials", async ({
  page,
}) => {
  await seedProvider(page, "nps");
  await page.goto("/dashboard?provider=nps");
  await expect(
    page.getByLabel("Notification URL", { exact: true }),
  ).toHaveCount(0);
  const response = page.getByLabel("Response URL", { exact: true });
  await response.fill("http://localhost:4100/nps/return");
  await page.getByRole("tab", { name: "Integration", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Provider docs",
      exact: true,
    }),
  ).toHaveAttribute("href", "https://apigateway.nepalpayment.com/Help");
  await page.getByRole("tab", { name: "Connection", exact: true }).click();
  await expect(response).toHaveValue("http://localhost:4100/nps/return");
  await page.getByRole("button", { name: "Save URLs", exact: true }).click();
  await expect(page.getByText("URLs saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(response).toHaveValue("http://localhost:4100/nps/return");
  await response.fill("https://user:password@example.com/return");
  await page.getByRole("button", { name: "Save URLs", exact: true }).click();
  await expect(
    page.getByText("Use an HTTP or HTTPS URL without embedded credentials.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("connectIPS registered URLs are required, saved, and survive reload", async ({
  page,
}) => {
  await seedProvider(page, "connectips");
  const cleared = await page.request.patch("/api/lab/providers/connectips", {
    headers: { Origin: webOrigin },
    data: { successUrl: null, failureUrl: null },
  });
  expect(cleared.status()).toBe(200);
  await page.goto("/dashboard?provider=connectips");
  await expect(
    page.getByText("Register your URLs to accept payments", { exact: true }),
  ).toBeVisible();
  const success = page.getByLabel("Success URL", { exact: true });
  const failure = page.getByLabel("Failure URL", { exact: true });
  await success.fill("http://localhost:4100/payments/connectips/success");
  await failure.fill("http://localhost:4100/payments/connectips/failure");
  await page.getByRole("button", { name: "Save URLs", exact: true }).click();
  await expect(page.getByText("URLs saved", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Register your URLs to accept payments", { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(success).toHaveValue(
    "http://localhost:4100/payments/connectips/success",
  );
  await expect(failure).toHaveValue(
    "http://localhost:4100/payments/connectips/failure",
  );
});
