"use client";

import {
  initiationModes,
  type Provider,
  type ProviderResponse,
} from "@nepal-payment-lab/shared";
import {
  BookOpenIcon,
  CircleAlertIcon,
  FlaskConicalIcon,
  InfoIcon,
  Link2Icon,
  PlugIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useState } from "react";
import { ProviderMark } from "@/components/provider-mark";
import { ProviderPicker } from "@/components/provider-picker";
import { ProviderScenarios } from "@/components/provider-scenarios";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getProvider } from "@/lib/providers";
import { useProviderDashboard } from "../_hooks/use-provider-dashboard";
import { DashboardLoading } from "./dashboard-loading";
import { ProviderConnection } from "./provider-connection";
import { ProviderGuide } from "./provider-reference";
import { ProviderSettingsForm } from "./provider-settings";
import { RegisteredUrls } from "./registered-urls";

export function ProviderDashboard({
  providerId,
  initial,
  baseUrl,
}: {
  providerId: Provider;
  initial: ProviderResponse | undefined;
  baseUrl: string;
}) {
  const provider = getProvider(providerId);
  const [activeTab, setActiveTab] = useState("connection");
  const { query, credential, revoke, save, notice, pending } =
    useProviderDashboard({ provider: provider.id, initial });
  const account = query.data?.account;
  const error = credential.error ?? revoke.error;
  const activeMode = account
    ? initiationModes[account.initiationMode]
    : undefined;
  const failing = account && account.initiationMode !== "allow";
  const unregistered =
    query.data?.key &&
    account &&
    provider.registeredUrls?.fields.some(({ key }) => !account[key]);

  return (
    <main
      id="main-content"
      className="site-container flex flex-col gap-4 py-6 sm:py-10"
    >
      <ProviderPicker provider={provider} disabled={pending} />
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="min-w-0 gap-6"
      >
        <Card className="gap-5 pb-1">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <ProviderMark
                provider={provider.id}
                size="lg"
                className="hidden sm:inline-flex"
              />
              <h1 className="heading text-3xl leading-tight sm:text-4xl">
                {provider.name}
              </h1>
            </div>
          </CardHeader>
          <TabsList
            variant="line"
            className="w-full justify-start rounded-none border-t px-3 sm:px-6"
            aria-label="Provider workspace"
          >
            <TabsTrigger value="connection" className="flex-none px-2 sm:px-3">
              <PlugIcon data-icon="inline-start" className="hidden sm:block" />
              Connection
            </TabsTrigger>
            <TabsTrigger value="integration" className="flex-none px-2 sm:px-3">
              <BookOpenIcon
                data-icon="inline-start"
                className="hidden sm:block"
              />
              Integration
            </TabsTrigger>
            <TabsTrigger value="scenarios" className="flex-none px-2 sm:px-3">
              <FlaskConicalIcon
                data-icon="inline-start"
                className="hidden sm:block"
              />
              Scenarios
            </TabsTrigger>
          </TabsList>
        </Card>
        {query.isPending && <DashboardLoading />}
        {query.isError && (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>
              {query.data
                ? "Could not refresh provider settings"
                : "Could not load provider settings"}
            </AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <p>{query.error.message}</p>
              <Button
                variant="outline"
                size="sm"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Could not update credentials</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert role="status">
            <InfoIcon aria-hidden="true" />
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {failing && (
          <Alert variant="warning">
            <TriangleAlertIcon aria-hidden="true" />
            <AlertTitle>Payment initiation is blocked</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <p>
                New {provider.name} payments stop before checkout while{" "}
                {activeMode?.name ?? "initiation failure"} is active. Choose
                Allow initiation and save the response to run checkout
                scenarios.
              </p>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href="#initiation-mode" />}
                onClick={() => setActiveTab("connection")}
              >
                Change initiation response
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {unregistered && (
          <Alert variant="warning">
            <Link2Icon aria-hidden="true" />
            <AlertTitle>Register your URLs to accept payments</AlertTitle>
            <AlertDescription>
              New {provider.name} payments are rejected until every registered
              URL is saved in Connection.
            </AlertDescription>
          </Alert>
        )}
        <TabsContent value="connection" keepMounted>
          {query.data && (
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)]">
              <ProviderConnection
                provider={provider}
                baseUrl={baseUrl}
                credential={query.data.key}
                pending={pending}
                generating={credential.isPending}
                onGenerate={() => credential.mutate(false)}
                onRotate={() => credential.mutate(true)}
                onRevoke={() => revoke.mutate()}
              />
              <div className="flex min-w-0 flex-col gap-6">
                {provider.registeredUrls && account && (
                  <RegisteredUrls
                    config={provider.registeredUrls}
                    initial={account}
                    pending={pending}
                    saving={save.isPending}
                    onSave={async (urls) => {
                      await save.mutateAsync(urls);
                    }}
                  />
                )}
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <h2>Initiation response</h2>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {account ? (
                      <ProviderSettingsForm
                        initial={account.initiationMode}
                        pending={pending}
                        saving={save.isPending}
                        onSave={async (mode) => {
                          await save.mutateAsync({ initiationMode: mode });
                        }}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Generate a lab key to configure initiation failures.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>
        <TabsContent value="integration">
          <ProviderGuide
            provider={provider}
            baseUrl={baseUrl}
            credential={query.data?.key ?? null}
          />
        </TabsContent>
        <TabsContent value="scenarios">
          <ProviderScenarios provider={provider} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
