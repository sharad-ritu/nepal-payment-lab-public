import {
  type Database,
  getProvider,
  type ProviderAccountRecord,
  revokeProviderKey,
  rotateProviderKey,
  updateProvider,
} from "@nepal-payment-lab/database";
import {
  credentialResponseSchema,
  type Provider,
  providerRegisteredUrlKeys,
  providerResponseSchema,
  providerSchema,
  providerSettingsSchema,
  registeredUrlKeyOptions,
} from "@nepal-payment-lab/shared";
import { Router } from "express";
import { z } from "zod";
import { makeCredential } from "./credentials";

function accountResponse(account: ProviderAccountRecord) {
  const provider = providerSchema.parse(account.provider);

  return {
    id: account.id,
    provider,
    initiationMode: account.initiationMode,
    createdAt: account.createdAt.toISOString(),
    ...Object.fromEntries(
      providerRegisteredUrlKeys(provider).map((key) => [key, account[key]]),
    ),
  };
}

function routeProvider(request: { params: { provider?: string } }): Provider {
  return providerSchema.parse(request.params.provider);
}

export function createLabRouter({ db }: { db: Database }) {
  const router = Router();

  router.param("provider", (_request, response, next, value: string) => {
    if (!providerSchema.safeParse(value).success) {
      response.status(404).json({
        kind: "not_found",
        message: "This provider is not available yet.",
      });
      return;
    }

    next();
  });

  router.get("/providers/:provider", async (request, response) => {
    const result = await getProvider({
      db,
      provider: routeProvider(request),
    });

    response.json(
      providerResponseSchema.parse({
        account: result ? accountResponse(result.account) : null,
        key: result?.key
          ? {
              ...result.key,
              createdAt: result.key.createdAt.toISOString(),
            }
          : null,
      }),
    );
  });

  router.patch("/providers/:provider", async (request, response) => {
    const provider = routeProvider(request);
    const input = providerSettingsSchema.safeParse(request.body);

    if (!input.success) {
      response.status(400).json({
        kind: "invalid_request",
        message:
          input.error.issues[0]?.message ?? "Check your provider settings.",
      });
      return;
    }

    const allowed = providerRegisteredUrlKeys(provider);
    if (
      registeredUrlKeyOptions.some(
        (key) => input.data[key] !== undefined && !allowed.includes(key),
      )
    ) {
      response.status(400).json({
        kind: "invalid_request",
        message: "These URLs cannot be registered for this provider.",
      });
      return;
    }

    const account = await updateProvider({
      db,
      provider,
      input: input.data,
    });

    if (!account) {
      response.status(404).json({
        kind: "not_found",
        message: "Generate credentials to enable this provider first.",
      });
      return;
    }

    response.json({ saved: true });
  });

  router.post("/providers/:provider/credentials", async (request, response) => {
    const input = z
      .object({ replace: z.boolean() })
      .strict()
      .safeParse(request.body);

    if (!input.success) {
      response.status(400).json({
        kind: "invalid_request",
        message: "Choose whether to replace the existing key.",
      });
      return;
    }

    const credential = makeCredential();
    const result = await rotateProviderKey({
      db,
      provider: routeProvider(request),
      key: {
        prefix: credential.key.prefix,
        digest: credential.key.digest,
        secret: credential.secret,
      },
      replace: input.data.replace,
    });

    if (!result) {
      response.status(409).json({
        kind: "key_exists",
        message:
          "Credentials already exist. Refresh to manage or rotate your key.",
      });
      return;
    }

    response.status(201).json(
      credentialResponseSchema.parse({
        account: accountResponse(result.account),
        secret: credential.secret,
        key: {
          ...result.key,
          createdAt: result.key.createdAt.toISOString(),
        },
      }),
    );
  });

  router.delete(
    "/providers/:provider/credentials",
    async (request, response) => {
      await revokeProviderKey({
        db,
        provider: routeProvider(request),
      });

      response.status(204).end();
    },
  );

  return router;
}
