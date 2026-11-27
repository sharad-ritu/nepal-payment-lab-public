"use client";

import { ProviderScenarios } from "@/components/provider-scenarios";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { providers } from "@/lib/providers";

export function ScenarioReference() {
  return (
    <Tabs defaultValue="khalti" className="min-w-0 gap-6">
      <TabsList variant="line" aria-label="Scenario provider">
        {providers.map((provider) => (
          <TabsTrigger key={provider.id} value={provider.id}>
            {provider.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {providers.map((provider) => (
        <TabsContent key={provider.id} value={provider.id}>
          <ProviderScenarios provider={provider} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
