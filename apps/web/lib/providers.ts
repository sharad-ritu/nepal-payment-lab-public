import { type Provider, providerSchema } from "@nepal-payment-lab/shared";
import { connectips } from "./providers/connectips";
import { esewa } from "./providers/esewa";
import { khalti } from "./providers/khalti";
import { nps } from "./providers/nps";
import type { ProviderDefinition } from "./providers/types";

export type { EnvEntry, ProviderDefinition } from "./providers/types";

const definitions: { [Id in Provider]: ProviderDefinition<Id> } = {
  khalti,
  esewa,
  connectips,
  nps,
};

export const providers = Object.values(definitions);

export function getProvider(value: string | string[] | undefined) {
  const parsed = providerSchema.safeParse(value);
  return definitions[parsed.success ? parsed.data : khalti.id];
}

export function providerApiUrl({
  provider,
  origin,
}: {
  provider: ProviderDefinition;
  origin: string;
}) {
  return `${origin.replace(/\/$/, "")}${provider.apiBasePath}`;
}
