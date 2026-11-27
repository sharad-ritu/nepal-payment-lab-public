import type { ProviderDefinition } from "./types";

export const khalti = {
  id: "khalti",
  name: "Khalti",
  productName: "Web checkout",
  apiBasePath: "/khalti/api/v2",
  endpointLabel: "API base URL",
  endpointHint: "Replaces https://dev.khalti.com/api/v2.",
  secretHint: "Send it as the Authorization header on every request.",
  extraFields: () => [],
  envExample: ({ baseUrl, secret }) => [
    {
      name: "KHALTI_BASE_URL",
      value: baseUrl,
    },
    {
      name: "KHALTI_SECRET_KEY",
      value: secret,
    },
  ],
  registeredUrls: null,
  guide: [
    {
      title: "Use your lab environment values",
      paragraphs: [
        "In Connection, generate a lab key and copy the .env values into your local test environment. Use the variable names your app already reads.",
        "Replace your Khalti API base URL and secret key. Keep your existing initiation, redirect, and lookup code.",
      ],
    },
    {
      title: "Run a payment from your app",
      paragraphs: [
        "Leave Initiation response on Allow initiation to reach checkout. Start a payment as usual, choose an outcome on the lab checkout page, then return to your app.",
        "Your existing return_url works, including localhost. Your usual lookup call receives the selected verification response.",
      ],
    },
  ],
  documentationUrl: "https://docs.khalti.com/khalti-epayment/",
} satisfies ProviderDefinition<"khalti">;
