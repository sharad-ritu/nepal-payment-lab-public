import { expect, test } from "@playwright/test";

test("the app opens directly in the dashboard without signing in", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Connect your app", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Sign in", { exact: true })).toHaveCount(0);
});

test("unknown forwarding routes and cross-origin writes are rejected", async ({
  request,
}) => {
  const unknown = await request.get("/api/lab/unknown");
  expect(unknown.status()).toBe(404);
  const crossOrigin = await request.post(
    "/api/lab/providers/khalti/credentials",
    {
      headers: { Origin: "http://another-site.test" },
      data: { replace: true },
    },
  );
  expect(crossOrigin.status()).toBe(403);
});

test("malformed checkout links cannot display a payment form", async ({
  page,
}) => {
  const response = await page.goto("/checkout/invalid");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("button", { name: "Return to app", exact: true }),
  ).toHaveCount(0);
});

test("public navigation exposes provider contracts and scenario guidance on mobile", async ({
  page,
}) => {
  await page.setViewportSize({
    width: 390,
    height: 844,
  });
  await page.goto("/");
  await page.getByRole("link", { name: "How it works", exact: true }).click();
  await expect(page).toHaveURL(/\/how-it-works$/);
  await expect(
    page.getByRole("heading", {
      name: "How it works",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();

  const providers = page.getByRole("table", {
    name: "Provider environment values and callback settings",
  });
  await expect(providers.getByRole("row")).toHaveCount(5);
  await expect(providers.getByRole("row", { name: /^NPX/ })).toContainText(
    "API username and password, signing secret",
  );
  await expect(providers.getByRole("row", { name: /^NPX/ })).toContainText(
    "Save your Response URL",
  );
  await expect(
    providers.getByRole("row", { name: /^connect IPS/ }),
  ).toContainText("Save your Success and Failure URLs");

  const scenarioProviders = page.getByRole("tablist", {
    name: "Scenario provider",
  });
  for (const provider of [
    {
      name: "Khalti",
      scenario: "Success return, pending verification",
      browserReturn: "Completed",
      verification: "Pending",
    },
    {
      name: "eSewa",
      scenario: "Success return, pending verification",
      browserReturn: "Success URL: COMPLETE",
      verification: "PENDING",
    },
    {
      name: "connect IPS",
      scenario: "Success return, pending verification",
      browserReturn: "Success URL",
      verification: "ERROR: incomplete",
    },
    {
      name: "NPX",
      scenario: "Pending payment",
      browserReturn: "Response URL: transaction IDs only",
      verification: "Pending",
    },
  ]) {
    await scenarioProviders
      .getByRole("tab", {
        name: provider.name,
        exact: true,
      })
      .click();
    const scenarios = page.getByRole("tabpanel").getByRole("table", {
      name: "Checkout scenario comparison",
    });
    await expect(scenarios).toBeVisible();
    const pending = scenarios.getByRole("row").filter({
      has: page.getByRole("rowheader", {
        name: provider.scenario,
        exact: true,
      }),
    });
    await expect(pending.getByRole("cell").nth(0)).toHaveText(
      provider.browserReturn,
    );
    await expect(pending.getByRole("cell").nth(1)).toHaveText(
      provider.verification,
    );
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
  await expect(page.getByRole("tabpanel")).toContainText(
    "Success, pending, cancellation, and expiry are reported by CheckTransactionStatus.",
  );
  await page
    .getByRole("link", { name: "Nepal Payment Lab dashboard", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Connect your app", exact: true }),
  ).toBeVisible();
});
