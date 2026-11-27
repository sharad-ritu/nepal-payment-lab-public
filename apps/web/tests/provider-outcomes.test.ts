import { expect, test } from "bun:test";
import type { ScenarioKey } from "@nepal-payment-lab/shared";
import { providerOutcome, providerOutcomes } from "../lib/provider-scenarios";

test.each(["khalti", "esewa", "connectips"] as const)(
  "%s offers every browser-return and verification scenario",
  (provider) => {
    const outcomes = providerOutcomes(provider);

    expect(outcomes.map((outcome) => outcome.value)).toEqual([
      "normal-completion",
      "pending-payment",
      "user-cancellation",
      "completed-redirect-pending-lookup",
      "amount-mismatch",
      "expired-payment",
      "lookup-timeout",
      "invalid-payment-id",
      "lookup-server-error",
      "completed-redirect-cancelled-lookup",
      "completed-redirect-expired-lookup",
    ]);
    expect(outcomes).toContainEqual({
      value: "normal-completion",
      label: "Full success",
      description: "The browser return and verification both report success.",
    });
    expect(outcomes).toContainEqual({
      value: "completed-redirect-pending-lookup",
      label: "Success return, pending verification",
      description:
        "The browser reports success, but verification stays pending until expiry.",
    });
    expect(outcomes).toContainEqual({
      value: "amount-mismatch",
      label: "Amount mismatch",
      description:
        "Verification reports one paisa more than the requested amount.",
    });
  },
);

test("NPX offers distinct verification outcomes without duplicate success-return presets", () => {
  const outcomes = providerOutcomes("nps");

  expect(outcomes.map((outcome) => outcome.value)).toEqual([
    "normal-completion",
    "pending-payment",
    "user-cancellation",
    "amount-mismatch",
    "expired-payment",
    "lookup-timeout",
    "invalid-payment-id",
    "lookup-server-error",
  ]);
  expect(
    outcomes.find((outcome) => outcome.value === "normal-completion"),
  ).toEqual({
    value: "normal-completion",
    label: "Verified success",
    description: "Verification returns Success.",
  });
  expect(
    outcomes.find((outcome) => outcome.value === "lookup-server-error"),
  ).toEqual({
    value: "lookup-server-error",
    label: "Verification server error",
    description: "Verification returns HTTP 500.",
  });
  expect(
    outcomes.find((outcome) => outcome.value === "invalid-payment-id"),
  ).toEqual({
    value: "invalid-payment-id",
    label: "Payment not found",
    description:
      "Verification returns code 1 with error_code 3, transaction not initialized.",
  });
});

test.each([
  {
    key: "completed-redirect-pending-lookup",
    label: "Pending verification",
    description: "Verification returns Pending.",
  },
  {
    key: "completed-redirect-cancelled-lookup",
    label: "Canceled verification",
    description: "Verification returns Fail.",
  },
  {
    key: "completed-redirect-expired-lookup",
    label: "Expired verification",
    description: "Verification returns Fail.",
  },
] satisfies {
  key: ScenarioKey;
  label: string;
  description: string;
}[])(
  "NPX can still display a script's saved $key preset",
  ({ key, label, description }) => {
    expect(
      providerOutcome({
        provider: "nps",
        key,
      }),
    ).toEqual({
      value: key,
      label,
      description,
    });
  },
);
