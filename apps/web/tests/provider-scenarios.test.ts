import { expect, test } from "bun:test";
import { type Provider, scenarios } from "@nepal-payment-lab/shared";
import { scenarioPreview } from "../lib/provider-scenarios";

test.each([
  { provider: "khalti", redirect: "Completed", verification: "Pending" },
  {
    provider: "esewa",
    redirect: "Success URL: COMPLETE",
    verification: "PENDING",
  },
  {
    provider: "connectips",
    redirect: "Success URL",
    verification: "ERROR: incomplete",
  },
] satisfies { provider: Provider; redirect: string; verification: string }[])(
  "$provider previews contradictory returns and verification separately",
  ({ provider, redirect, verification }) => {
    expect(
      scenarioPreview({
        provider,
        snapshot: scenarios["completed-redirect-pending-lookup"].snapshot,
      }),
    ).toEqual({ redirect, verification });
  },
);

test("eSewa previews expiry using its distinct return and verification vocabulary", () => {
  expect(
    scenarioPreview({
      provider: "esewa",
      snapshot: scenarios["expired-payment"].snapshot,
    }),
  ).toEqual({ redirect: "Failure URL: CANCELED", verification: "NOT_FOUND" });
});

test("connectIPS cancellation selects the failure destination", () => {
  expect(
    scenarioPreview({
      provider: "connectips",
      snapshot: scenarios["user-cancellation"].snapshot,
    }),
  ).toEqual({ redirect: "Failure URL", verification: "FAILED" });
});

test.each(["khalti", "esewa", "connectips", "nps"] satisfies Provider[])(
  "%s shows verification timeout and amount mismatch",
  (provider) => {
    expect(
      scenarioPreview({
        provider,
        snapshot: scenarios["lookup-timeout"].snapshot,
      }).verification,
    ).toBe("Connection closes after 60 seconds");
    expect(
      scenarioPreview({
        provider,
        snapshot: scenarios["amount-mismatch"].snapshot,
      }).verification,
    ).toContain("with one extra paisa");
  },
);

test("Khalti previews a missing payment as HTTP 404", () => {
  expect(
    scenarioPreview({
      provider: "khalti",
      snapshot: scenarios["invalid-payment-id"].snapshot,
    }).verification,
  ).toBe("Not found, HTTP 404");
});

test("NPS browser returns expose only identifiers while verification decides the outcome", () => {
  expect(
    scenarioPreview({
      provider: "nps",
      snapshot: scenarios["completed-redirect-pending-lookup"].snapshot,
    }),
  ).toEqual({
    redirect: "Response URL: transaction IDs only",
    verification: "Pending",
  });
  expect(
    scenarioPreview({
      provider: "nps",
      snapshot: scenarios["expired-payment"].snapshot,
    }).verification,
  ).toBe("Fail");
  expect(
    scenarioPreview({
      provider: "nps",
      snapshot: scenarios["invalid-payment-id"].snapshot,
    }).verification,
  ).toBe("code 1: transaction not initialized");
});

test.each([
  {
    provider: "khalti",
    redirect: "Completed",
  },
  {
    provider: "esewa",
    redirect: "Success URL: COMPLETE",
  },
  {
    provider: "connectips",
    redirect: "Success URL",
  },
  {
    provider: "nps",
    redirect: "Response URL: transaction IDs only",
  },
] satisfies { provider: Provider; redirect: string }[])(
  "$provider previews verification server errors separately from successful returns",
  ({ provider, redirect }) => {
    const preview = scenarioPreview({
      provider,
      snapshot: scenarios["lookup-server-error"].snapshot,
    });

    expect(preview).toEqual({
      redirect,
      verification: "HTTP 500",
    });
  },
);
