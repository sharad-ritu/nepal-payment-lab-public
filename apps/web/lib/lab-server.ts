import {
  type Provider,
  providerResponseSchema,
} from "@nepal-payment-lab/shared";
import { z } from "zod";

const internalOrigin = z
  .url()
  .default("http://localhost:45174")
  .parse(process.env.API_INTERNAL_URL);

export function fetchLab(path: string, init: RequestInit = {}) {
  return fetch(new URL(path, internalOrigin), {
    ...init,
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(5000),
  });
}

export async function loadProvider(provider: Provider) {
  try {
    const response = await fetchLab(`/v1/providers/${provider}`);
    if (!response.ok) return undefined;

    return providerResponseSchema.parse(await response.json());
  } catch {
    return undefined;
  }
}
