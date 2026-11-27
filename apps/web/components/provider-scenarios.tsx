"use client";

import { providerCheckoutMinutes, scenarios } from "@nepal-payment-lab/shared";
import { ChevronDownIcon } from "lucide-react";
import { CodeBlock } from "@/components/code-block";
import { StatusText } from "@/components/status-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  providerOutcomes,
  scenarioPreview,
  scenarioSignals,
} from "@/lib/provider-scenarios";
import type { ProviderDefinition } from "@/lib/providers";

export function ProviderScenarios({
  provider,
}: {
  provider: ProviderDefinition;
}) {
  const outcomes = providerOutcomes(provider.id);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <p className="max-w-prose text-sm text-muted-foreground">
        {provider.id === "nps"
          ? "NPX browser returns contain transaction IDs only. Success, pending, cancellation, and expiry are reported by CheckTransactionStatus."
          : "Choose a scenario on checkout. The browser return and verification can differ; your app must verify the status, IDs, and amount."}{" "}
        Pending verification expires after{" "}
        {providerCheckoutMinutes[provider.id]} minutes from initiation.
      </p>
      {/* biome-ignore-start lint/a11y/noNoninteractiveTabindex: The comparison scrolls horizontally on narrow screens. */}
      <Table
        className="min-w-[38rem]"
        tabIndex={0}
        aria-label="Checkout scenario comparison"
      >
        <TableCaption className="sr-only">
          {provider.name} browser return and verification outcomes
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Scenario</TableHead>
            <TableHead scope="col">Browser return</TableHead>
            <TableHead scope="col">Verification</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {outcomes.map((outcome) => {
            const scenario = scenarios[outcome.value];
            const preview = scenarioPreview({
              provider: provider.id,
              snapshot: scenario.snapshot,
            });
            const signals = scenarioSignals(scenario.snapshot);
            return (
              <TableRow key={outcome.value}>
                <TableHead scope="row" className="w-2/5 whitespace-normal py-3">
                  <span className="block font-medium">{outcome.label}</span>
                </TableHead>
                <TableCell>
                  {provider.id === "nps" ? (
                    preview.redirect
                  ) : (
                    <StatusText tone={signals.redirect.tone}>
                      {preview.redirect}
                    </StatusText>
                  )}
                </TableCell>
                <TableCell>
                  <StatusText tone={signals.verification.tone}>
                    {preview.verification}
                  </StatusText>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {/* biome-ignore-end lint/a11y/noNoninteractiveTabindex: The comparison scrolls horizontally on narrow screens. */}
      {provider.id === "nps" && (
        <p className="text-sm text-muted-foreground">
          Missing transactions return code 1 with error_code 3. Cancellation and
          expiry both return Fail.
        </p>
      )}
      <Card size="sm">
        <CardHeader>
          <CardTitle>
            <h3>Preselect an outcome in scripts</h3>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="max-w-prose text-sm text-muted-foreground">
            {provider.id === "nps"
              ? "Send this optional header on GetProcessId."
              : "Send this optional header with the initiation request."}{" "}
            It preselects an outcome. You still submit checkout, and saved
            initiation failures take precedence. Browser forms cannot set custom
            headers.
          </p>
          <CodeBlock
            label="Scenario header"
            code={`Payment-Lab-Scenario: ${provider.id === "nps" ? "pending-payment" : "completed-redirect-pending-lookup"}`}
          />
          <Collapsible>
            <CollapsibleTrigger
              render={
                <Button variant="ghost" size="sm" className="group/trigger" />
              }
            >
              <ChevronDownIcon
                data-icon="inline-start"
                className="transition-transform group-aria-expanded/trigger:rotate-180"
              />
              Scenario header values
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <CodeBlock
                label="Scenario values"
                code={outcomes.map((outcome) => outcome.value).join("\n")}
              />
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </div>
  );
}
