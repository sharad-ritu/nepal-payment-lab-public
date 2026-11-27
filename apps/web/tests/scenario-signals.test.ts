import { expect, test } from "bun:test";
import {
  type ScenarioKey,
  scenarioKeySchema,
  scenarios,
} from "@nepal-payment-lab/shared";
import { scenarioSignals } from "../lib/provider-scenarios";

// Expected payment decisions are independent of the display implementation.
const expected = {
  "normal-completion": {
    redirect: {
      label: "Success",
      tone: "success",
    },
    verification: {
      label: "Paid",
      tone: "success",
    },
    agrees: true,
  },
  "pending-payment": {
    redirect: {
      label: "Pending",
      tone: "pending",
    },
    verification: {
      label: "Pending",
      tone: "pending",
    },
    agrees: true,
  },
  "user-cancellation": {
    redirect: {
      label: "Canceled",
      tone: "failure",
    },
    verification: {
      label: "Canceled",
      tone: "failure",
    },
    agrees: true,
  },
  "completed-redirect-pending-lookup": {
    redirect: {
      label: "Success",
      tone: "success",
    },
    verification: {
      label: "Pending",
      tone: "pending",
    },
    agrees: false,
  },
  "amount-mismatch": {
    redirect: {
      label: "Success",
      tone: "success",
    },
    verification: {
      label: "Wrong amount",
      tone: "failure",
    },
    agrees: false,
  },
  "expired-payment": {
    redirect: {
      label: "Expired",
      tone: "failure",
    },
    verification: {
      label: "Expired",
      tone: "failure",
    },
    agrees: true,
  },
  "lookup-timeout": {
    redirect: {
      label: "Success",
      tone: "success",
    },
    verification: {
      label: "No response",
      tone: "failure",
    },
    agrees: false,
  },
  "invalid-payment-id": {
    redirect: {
      label: "Success",
      tone: "success",
    },
    verification: {
      label: "Not found",
      tone: "failure",
    },
    agrees: false,
  },
  "lookup-server-error": {
    redirect: {
      label: "Success",
      tone: "success",
    },
    verification: {
      label: "HTTP 500",
      tone: "failure",
    },
    agrees: false,
  },
  "completed-redirect-cancelled-lookup": {
    redirect: {
      label: "Success",
      tone: "success",
    },
    verification: {
      label: "Canceled",
      tone: "failure",
    },
    agrees: false,
  },
  "completed-redirect-expired-lookup": {
    redirect: {
      label: "Success",
      tone: "success",
    },
    verification: {
      label: "Expired",
      tone: "failure",
    },
    agrees: false,
  },
} satisfies Record<ScenarioKey, ReturnType<typeof scenarioSignals>>;

test.each(scenarioKeySchema.options)(
  "%s displays whether browser return and verified payment agree",
  (key) => {
    expect(scenarioSignals(scenarios[key].snapshot)).toEqual(expected[key]);
  },
);

test("a wrong amount stays unsafe when verification reports a smaller amount", () => {
  const signals = scenarioSignals({
    version: 1,
    key: "amount-mismatch",
    redirectStatus: "completed",
    lookup: {
      kind: "payment",
      status: "completed",
      amountDelta: -1,
    },
  });

  expect(signals).toEqual(expected["amount-mismatch"]);
});
