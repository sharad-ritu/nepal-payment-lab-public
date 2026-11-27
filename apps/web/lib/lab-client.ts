"use client";

import { apiErrorSchema } from "@nepal-payment-lab/shared";

export async function labRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`/api/lab/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });
  if (response.status === 204) return null;

  const body: unknown = await response.json();

  if (!response.ok) {
    const error = apiErrorSchema.safeParse(body);
    throw new Error(
      error.success ? error.data.message : "The request failed. Try again.",
    );
  }

  return body;
}
