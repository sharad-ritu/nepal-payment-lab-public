"use client";

import {
  type Provider,
  type ScenarioKey,
  scenarioKeySchema,
  scenarios,
} from "@nepal-payment-lab/shared";
import { CornerDownLeftIcon, EqualIcon, SplitIcon } from "lucide-react";
import { useState } from "react";
import { StatusText } from "@/components/status-text";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  providerOutcome,
  providerOutcomes,
  scenarioPreview,
  scenarioSignals,
} from "@/lib/provider-scenarios";

export function CheckoutForm({
  token,
  initialScenario,
  returnHost,
  failureHost,
  provider,
}: {
  token: string;
  initialScenario: ScenarioKey;
  returnHost: string;
  failureHost: string | null;
  provider: Provider;
}) {
  const [selection, setSelection] = useState(initialScenario);
  const [pending, setPending] = useState(false);
  const scenario = scenarios[selection];
  const outcome = providerOutcome({
    provider,
    key: selection,
  });
  const preview = scenarioPreview({ provider, snapshot: scenario.snapshot });
  const signals = scenarioSignals(scenario.snapshot);
  const destination =
    scenario.snapshot.redirectStatus === "completed"
      ? returnHost
      : (failureHost ?? returnHost);
  const items = providerOutcomes(provider);
  // Keep a script's older preset selectable even when NPX's menu omits
  // equivalent outcomes. Submission preserves the requested snapshot.
  const options = items.some((item) => item.value === selection)
    ? items
    : [...items, outcome];

  return (
    <form
      method="post"
      action={`/checkout/${token}/simulate`}
      className="flex flex-col gap-6"
      onSubmit={() => setPending(true)}
    >
      <FieldGroup>
        <Field data-disabled={pending}>
          <FieldLabel htmlFor="payment-outcome">Payment outcome</FieldLabel>
          <input type="hidden" name="scenarioKey" value={selection} />
          <Select
            items={options}
            value={selection}
            disabled={pending}
            onValueChange={(value) => {
              if (value === null) {
                return;
              }
              setSelection(scenarioKeySchema.parse(value));
            }}
          >
            <SelectTrigger
              id="payment-outcome"
              aria-describedby="outcome-description"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {options.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription id="outcome-description">
            {outcome.description}
          </FieldDescription>
        </Field>
      </FieldGroup>

      <Card size="sm" aria-labelledby="receives-heading" aria-live="polite">
        <CardHeader>
          <CardTitle>
            <h3 id="receives-heading">What your app receives</h3>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            {[
              {
                term: "Browser return",
                label: preview.redirect,
                tone: signals.redirect.tone,
              },
              {
                term: "Verification",
                label: preview.verification,
                tone: signals.verification.tone,
              },
            ].map((row) => (
              <div key={row.term} className="flex flex-col gap-1.5">
                <dt className="text-xs text-muted-foreground">{row.term}</dt>
                <dd>
                  {provider === "nps" && row.term === "Browser return" ? (
                    row.label
                  ) : (
                    <StatusText tone={row.tone}>{row.label}</StatusText>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {provider !== "nps" && (
            <Alert
              variant={signals.agrees ? "default" : "warning"}
              role="status"
            >
              {signals.agrees ? (
                <EqualIcon aria-hidden="true" />
              ) : (
                <SplitIcon aria-hidden="true" className="rotate-90" />
              )}
              <AlertDescription>{scenario.expectation}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <CornerDownLeftIcon data-icon="inline-start" />
          )}
          {pending ? "Returning..." : "Return to app"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Returns to <span className="break-all">{destination}</span>.
        </p>
      </div>
    </form>
  );
}
