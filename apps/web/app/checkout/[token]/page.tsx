import { checkoutSchema, checkoutTokenSchema } from "@nepal-payment-lab/shared";
import { CircleAlertIcon, Clock3Icon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProviderMark } from "@/components/provider-mark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { fetchLab } from "@/lib/lab-server";
import { getProvider } from "@/lib/providers";
import { CheckoutForm } from "./checkout-form";

export const dynamic = "force-dynamic";

const rupees = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const metadata: Metadata = {
  title: "Simulated checkout",
  description:
    "Choose a simulated payment outcome and return to your app. No real money moves.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!checkoutTokenSchema.safeParse(token).success) notFound();

  const data = await fetchLab(`/v1/checkout/${token}`)
    .then(async (response) =>
      response.ok ? checkoutSchema.parse(await response.json()) : null,
    )
    .catch(() => null);
  if (!data)
    return (
      <main id="main-content" className="workspace-container py-16">
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Checkout unavailable</AlertTitle>
          <AlertDescription>
            The link may have been deleted, or the lab API is unavailable. Try
            again or initiate a new payment.
          </AlertDescription>
        </Alert>
      </main>
    );
  const unavailable = data.used || Date.parse(data.expiresAt) <= Date.now();
  const provider = getProvider(data.provider);

  return (
    <main
      id="main-content"
      className="workspace-container flex flex-col gap-5 py-10 sm:py-14"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ProviderMark provider={provider.id} active />
          <h1 className="heading text-xl">{provider.name} test payment</h1>
        </div>
      </div>
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>
              <h2 className="break-words">
                {data.provider === "esewa"
                  ? "ePay payment"
                  : data.provider === "nps"
                    ? "OnePG payment"
                    : data.orderName}
              </h2>
            </CardTitle>
            <p className="display flex items-baseline gap-2 text-5xl break-all tabular-nums sm:text-6xl">
              <span className="font-sans text-lg font-medium tracking-normal text-muted-foreground">
                NPR
              </span>
              {rupees.format(data.amountMinor / 100)}
            </p>
          </div>
          <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            Order
            <code className="min-w-0 truncate rounded-sm bg-muted px-1.5 py-0.5 font-mono text-foreground">
              {data.orderId}
            </code>
          </p>
        </CardHeader>
        <Separator />
        <CardContent className="flex flex-col gap-6">
          {unavailable ? (
            <Alert>
              <Clock3Icon aria-hidden="true" />
              <AlertTitle>
                {data.used ? "Checkout already used" : "Checkout expired"}
              </AlertTitle>
              <AlertDescription>
                Initiate a new payment to run another simulation.
              </AlertDescription>
            </Alert>
          ) : (
            <CheckoutForm
              token={token}
              initialScenario={data.scenarioKey}
              returnHost={data.returnHost}
              failureHost={data.failureHost}
              provider={data.provider}
            />
          )}
        </CardContent>
        <CardFooter>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheckIcon
              aria-hidden="true"
              className="size-3.5 text-primary"
            />
            Test environment. No real money moves.
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
