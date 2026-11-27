import {
  esewaReturnStatuses,
  type Provider,
  providerStatuses,
  type ScenarioKey,
  type ScenarioSnapshot,
  scenarioKeySchema,
  scenarios,
} from "@nepal-payment-lab/shared";

type PaymentStatus = ScenarioSnapshot["redirectStatus"];

function verificationStatus(provider: Provider, status: PaymentStatus) {
  const label = providerStatuses[provider][status];
  if (provider !== "connectips" || label !== "ERROR") return label;

  return `${label}: ${status === "expired" ? "not found" : "incomplete"}`;
}

export function scenarioPreview({
  provider,
  snapshot,
}: {
  provider: Provider;
  snapshot: ScenarioSnapshot;
}) {
  const completed = snapshot.redirectStatus === "completed";
  const redirect =
    provider === "nps"
      ? "Response URL: transaction IDs only"
      : provider === "connectips"
        ? completed
          ? "Success URL"
          : "Failure URL"
        : provider === "esewa"
          ? `${completed ? "Success" : "Failure"} URL: ${esewaReturnStatuses[snapshot.redirectStatus]}`
          : providerStatuses.khalti[snapshot.redirectStatus];
  const lookup = snapshot.lookup;
  let verification: string;
  switch (lookup.kind) {
    case "timeout":
      verification = `Connection closes after ${lookup.delayMs / 1000} seconds`;
      break;
    case "server_error":
      verification = "HTTP 500";
      break;
    case "not_found":
      verification =
        provider === "khalti"
          ? "Not found, HTTP 404"
          : provider === "esewa"
            ? "NOT_FOUND"
            : provider === "nps"
              ? "code 1: transaction not initialized"
              : "ERROR: not found";
      break;
    case "payment":
      verification = verificationStatus(provider, lookup.status);
      if (lookup.amountDelta !== 0) verification += " with one extra paisa";
      break;
  }
  return { redirect, verification };
}

// NPX returns the same IDs for every outcome. Its success-return presets
// have the same observable result as pending, cancellation, and expiry.
export function providerOutcome({
  provider,
  key,
}: {
  provider: Provider;
  key: ScenarioKey;
}) {
  const scenario = scenarios[key];
  if (provider !== "nps") {
    return {
      value: key,
      label: scenario.name,
      description: scenario.description,
    };
  }
  const verification = scenarioPreview({
    provider,
    snapshot: scenario.snapshot,
  }).verification;
  const labels: Partial<Record<ScenarioKey, string>> = {
    "normal-completion": "Verified success",
    "completed-redirect-pending-lookup": "Pending verification",
    "lookup-server-error": "Verification server error",
    "completed-redirect-cancelled-lookup": "Canceled verification",
    "completed-redirect-expired-lookup": "Expired verification",
  };
  return {
    value: key,
    label: labels[key] ?? scenario.name,
    description:
      key === "invalid-payment-id"
        ? "Verification returns code 1 with error_code 3, transaction not initialized."
        : `Verification returns ${verification}.`,
  };
}

export function providerOutcomes(provider: Provider) {
  return scenarioKeySchema.options
    .filter(
      (key) => provider !== "nps" || !key.startsWith("completed-redirect-"),
    )
    .map((key) =>
      providerOutcome({
        provider,
        key,
      }),
    );
}

export type SignalTone = "success" | "pending" | "failure";

const statusTones = {
  initiated: "pending",
  completed: "success",
  pending: "pending",
  cancelled: "failure",
  expired: "failure",
} satisfies Record<PaymentStatus, SignalTone>;

const genericLabels = {
  initiated: "Initiated",
  completed: "Paid",
  pending: "Pending",
  cancelled: "Canceled",
  expired: "Expired",
} satisfies Record<PaymentStatus, string>;

export function scenarioSignals(snapshot: ScenarioSnapshot) {
  const lookup = snapshot.lookup;
  let verification: { label: string; tone: SignalTone };
  switch (lookup.kind) {
    case "timeout":
      verification = {
        label: "No response",
        tone: "failure",
      };
      break;
    case "server_error":
      verification = {
        label: "HTTP 500",
        tone: "failure",
      };
      break;
    case "not_found":
      verification = {
        label: "Not found",
        tone: "failure",
      };
      break;
    case "payment":
      verification =
        lookup.amountDelta === 0
          ? {
              label: genericLabels[lookup.status],
              tone: statusTones[lookup.status],
            }
          : {
              label: "Wrong amount",
              tone: "failure",
            };
      break;
  }

  return {
    redirect: {
      label:
        snapshot.redirectStatus === "completed"
          ? "Success"
          : genericLabels[snapshot.redirectStatus],
      tone: statusTones[snapshot.redirectStatus],
    },
    verification,
    agrees:
      (snapshot.redirectStatus === "completed") ===
      (verification.tone === "success"),
  };
}
