import type { Provider } from "@nepal-payment-lab/shared";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ProviderMark } from "@/components/provider-mark";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { providers } from "@/lib/providers";
import { ScenarioReference } from "./_components/scenario-reference";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Use your existing Khalti, eSewa, connectIPS, or NPX integration with lab environment values and choose payment outcomes for local development and tests.",
};

const sections = {
  setup: "Connect your app",
  testing: "Run a payment",
  scenarios: "Scenarios",
  limits: "Lab differences",
  disclaimer: "Disclaimer",
};

const environmentValues = {
  khalti: "API base URL and secret key",
  esewa: "Form URL, status URL, product code, and signing secret",
  connectips: "Base URL, merchant ID, app ID, and app password",
  nps: "API URL, gateway URL, API username and password, signing secret, merchant ID, and merchant name",
} satisfies Record<Provider, string>;

const callbackSettings = {
  khalti: "Use your existing return_url",
  esewa: "Use your existing success_url and failure_url",
  connectips: "Save your Success and Failure URLs",
  nps: "Save your Response URL",
} satisfies Record<Provider, string>;

const testingSteps = [
  "Leave Initiation response on Allow initiation and start a payment through your app's existing checkout flow.",
  "Choose an outcome on the lab checkout page and select Return to app. Your usual return handling and verification code receive the simulated result.",
  "Check that your app marks the order paid only when verification confirms the status, transaction IDs, and amount.",
];

const limits = [
  "connectIPS requires APPNAME and a TOKEN signed from the transaction details. Keep your existing token-generation code and test key configuration, whether you use CREDITOR.pfx, PEM, a base64-encoded key, or another keystore. Generate TOKEN using the lab merchant and app IDs. The lab requires TOKEN but does not verify its RSA signature. No lab-specific signing key or certificate is needed; the app password is only for Basic authentication.",
  "eSewa returns signed data on both success and failure URLs. Simulated expiry returns CANCELED to the browser and NOT_FOUND from verification.",
  "NPX exposes a TMBANK test instrument and a fixed NPR 5 fee. Browser returns contain transaction IDs without a payment status. The lab does not send webhooks.",
  "Unused and pending payments expire after five minutes for eSewa, 30 minutes for Khalti, and 60 minutes for the other providers. Payments are retained for seven days.",
  "Refunds, mobile SDKs, and other provider products are outside the lab's scope.",
];

function Section({
  id,
  children,
}: {
  id: keyof typeof sections;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="flex flex-col gap-5"
    >
      <h2 id={`${id}-heading`} className="heading text-2xl sm:text-3xl">
        {sections[id]}
      </h2>
      {children}
    </section>
  );
}

export default function HowItWorks() {
  return (
    <main
      id="main-content"
      className="site-container grid gap-12 pt-12 pb-20 sm:pt-20 sm:pb-28 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-16"
    >
      <nav aria-label="On this page" className="hidden lg:block">
        <ul className="sticky top-28 flex flex-col gap-2.5 border-l pl-4 text-sm">
          {Object.entries(sections).map(([id, title]) => (
            <li key={id}>
              <Button
                variant="link"
                size="sm"
                nativeButton={false}
                render={<a href={`#${id}`} />}
                className="h-auto px-0"
              >
                {title}
              </Button>
            </li>
          ))}
        </ul>
      </nav>

      <article className="flex min-w-0 flex-col gap-12 leading-7">
        <header className="flex flex-col gap-6">
          <h1 className="display text-5xl sm:text-6xl lg:text-7xl">
            How it works
          </h1>
          <p className="max-w-[58ch] text-lg leading-8 text-muted-foreground">
            Keep your provider integration code. Replace its environment values
            with the lab's, then choose how each test payment ends. No real
            money moves.
          </p>
        </header>

        <Section id="setup">
          <p className="max-w-[65ch]">
            Open the dashboard, choose a provider, and generate a lab key in
            Connection. Copy the .env values into your local test environment,
            using the variable names your app already reads. Your existing
            request, signing, and verification code stays the same.
          </p>
          <Table className="min-w-[40rem]">
            <TableCaption className="sr-only">
              Provider environment values and callback settings
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Provider</TableHead>
                <TableHead scope="col">Replace in your environment</TableHead>
                <TableHead scope="col">Callback URLs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((provider) => (
                <TableRow key={provider.id}>
                  <TableHead scope="row" className="py-4">
                    <div className="flex items-center gap-3">
                      <ProviderMark provider={provider.id} size="sm" />
                      <span>{provider.name}</span>
                    </div>
                  </TableHead>
                  <TableCell className="max-w-[32ch] whitespace-normal">
                    {environmentValues[provider.id]}
                  </TableCell>
                  <TableCell className="max-w-[28ch] whitespace-normal">
                    {callbackSettings[provider.id]}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            Save connectIPS and NPX callback URLs in Registered URLs before
            starting a payment. New payments keep the URLs saved at creation.
          </p>
        </Section>

        <Section id="testing">
          <ol className="flex max-w-[65ch] flex-col gap-5">
            {testingSteps.map((step, index) => (
              <li
                key={step}
                className="grid grid-cols-[2rem_minmax(0,1fr)] items-baseline"
              >
                <span className="display text-2xl text-primary">
                  {index + 1}
                </span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
          <p className="max-w-[65ch]">
            To fail a request before checkout, save a validation error,
            authentication error, server error, or timeout in Initiation
            response. This applies to new initiation requests using your
            provider account until you change it. Failed initiation creates no
            payment or checkout link.
          </p>
        </Section>

        <Section id="scenarios">
          <ScenarioReference />
        </Section>

        <Section id="limits">
          <ul className="flex max-w-[65ch] list-disc flex-col gap-2 pl-5 marker:text-primary">
            {limits.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </Section>

        <Section id="disclaimer">
          <div className="flex max-w-[65ch] flex-col gap-4">
            <p>
              Nepal Payment Lab's supported integrations are based on the
              official provider documentation available at the time of
              implementation. The last recorded contract review was on 2 October
              2026. NPX follows the supplied 2025 OnePG developer guidelines.
              Provider documentation may change, and newer or private merchant
              specifications may differ from these references.
            </p>
            <p>
              This is an independent simulator for local development and
              automated tests. No real money moves, and the lab does not process
              payments through the live providers. Use lab credentials and
              synthetic test data. Do not submit production credentials or real
              customer information.
            </p>
            <p>
              Simulated responses, failure scenarios, timing, and security
              checks may differ from a provider's live gateway. Responses were
              compared with the official sandboxes, but not with production
              gateways. Passing a lab test does not guarantee production
              compatibility. Validate your integration against the provider's
              current documentation and official sandbox before going live.
            </p>
            <p>
              Provider names and logos identify the integrations being simulated
              and do not imply provider endorsement or certification.
            </p>
          </div>
          <ul
            aria-label="Official provider documentation"
            className="flex flex-wrap gap-x-6 gap-y-2 text-sm"
          >
            {providers.map((provider) => (
              <li key={provider.id}>
                <a
                  href={provider.documentationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-4"
                >
                  {provider.name} documentation
                </a>
              </li>
            ))}
          </ul>
        </Section>

        <div className="flex flex-col items-start gap-8">
          <Separator />
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href="/dashboard" />}
          >
            Open the lab
          </Button>
        </div>
      </article>
    </main>
  );
}
