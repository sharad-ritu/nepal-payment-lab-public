import type {
  Provider,
  RegisteredUrlKey,
  registeredUrlKeys,
} from "@nepal-payment-lab/shared";

type ProviderEnvInput = {
  baseUrl: string;
  secret: string;
  prefix: string;
};

export type EnvEntry = {
  name: string;
  value: string;
  comment?: string;
};

type RegisteredUrlField<Key extends RegisteredUrlKey> = {
  key: Key;
  label: string;
  help: string;
  placeholder: string;
};

type RegisteredUrls<Keys extends readonly RegisteredUrlKey[]> =
  Keys extends readonly []
    ? null
    : {
        note: string;
        fields: { [Index in keyof Keys]: RegisteredUrlField<Keys[Index]> };
      };

export type ProviderDefinition<Id extends Provider = Provider> = {
  id: Id;
  name: string;
  productName: string;
  apiBasePath: string;
  endpointLabel: string;
  endpointHint: string;
  secretHint: string;
  extraFields: (input: { prefix: string }) => {
    id: string;
    label: string;
    value: string;
    hint: string;
  }[];
  envExample: (input: ProviderEnvInput) => EnvEntry[];
  envNote?: string;
  // URLs the live provider team registers during merchant onboarding.
  registeredUrls: RegisteredUrls<(typeof registeredUrlKeys)[Id]>;
  guide: {
    title: string;
    paragraphs: string[];
  }[];
  documentationUrl: string;
};
