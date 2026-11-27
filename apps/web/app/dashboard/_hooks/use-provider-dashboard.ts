"use client";

import {
  credentialResponseSchema,
  type Provider,
  type ProviderResponse,
  type ProviderSettings,
  providerResponseSchema,
} from "@nepal-payment-lab/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { labRequest } from "@/lib/lab-client";

export function useProviderDashboard({
  provider,
  initial,
}: {
  provider: Provider;
  initial: ProviderResponse | undefined;
}) {
  const client = useQueryClient();
  const queryKey = ["provider", provider];

  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) =>
      providerResponseSchema.parse(
        await labRequest(`providers/${provider}`, { signal }),
      ),
    ...(initial ? { initialData: initial } : {}),
  });

  const [notice, setNotice] = useState("");

  async function prepareMutation() {
    setNotice("");
    await client.cancelQueries({ queryKey });
  }

  const credential = useMutation({
    onMutate: async () => {
      revoke.reset();
      await prepareMutation();
    },
    mutationFn: async (replace: boolean) => {
      return credentialResponseSchema.parse(
        await labRequest(`providers/${provider}/credentials`, {
          method: "POST",
          body: JSON.stringify({ replace }),
        }),
      );
    },
    onSuccess: async (result, replace) => {
      await client.cancelQueries({ queryKey });
      client.setQueryData<ProviderResponse>(queryKey, {
        account: result.account,
        key: result.key,
      });
      setNotice(
        replace
          ? "Key replaced. Update every app using this provider."
          : "Key generated. Copy the environment values into your app.",
      );
      return client.invalidateQueries({ queryKey });
    },
  });

  const revoke = useMutation({
    onMutate: async () => {
      credential.reset();
      await prepareMutation();
    },
    mutationFn: async () => {
      await labRequest(`providers/${provider}/credentials`, {
        method: "DELETE",
      });
    },
    onSuccess: async () => {
      setNotice(
        "Key revoked. Generate a new key when you want to reconnect your apps.",
      );
      await client.cancelQueries({ queryKey });
      client.setQueryData<ProviderResponse>(queryKey, (previous) =>
        previous
          ? {
              ...previous,
              key: null,
            }
          : previous,
      );
      return client.invalidateQueries({ queryKey });
    },
  });

  const save = useMutation({
    onMutate: async () => {
      credential.reset();
      revoke.reset();
      await prepareMutation();
    },
    mutationFn: async (input: ProviderSettings) => {
      await labRequest(`providers/${provider}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    },
    onSuccess: async (_result, { initiationMode, ...urls }) => {
      await client.cancelQueries({ queryKey });
      client.setQueryData<ProviderResponse>(queryKey, (previous) =>
        previous?.account
          ? {
              ...previous,
              account: {
                ...previous.account,
                ...urls,
                ...(initiationMode ? { initiationMode } : {}),
              },
            }
          : previous,
      );
      return client.invalidateQueries({ queryKey });
    },
  });

  const pending = credential.isPending || revoke.isPending || save.isPending;

  return {
    query,
    credential,
    revoke,
    save,
    notice,
    pending,
  };
}
