import { npsMerchantId } from "@nepal-payment-lab/shared";
import type { ProviderDefinition } from "./types";

export const nps = {
  id: "nps",
  name: "NPX",
  productName: "OnePG gateway checkout",
  apiBasePath: "/nps",
  endpointLabel: "Lab base URL",
  endpointHint:
    "Replaces https://apisandbox.nepalpayment.com for APIs and https://gatewaysandbox.nepalpayment.com for the gateway form.",
  secretHint:
    "Use this lab secret as both the Basic-auth password and HMAC-SHA512 secret key.",
  extraFields: ({ prefix }) => [
    {
      id: "api-username",
      label: "API username",
      value: prefix,
      hint: "Send as the Basic-auth username.",
    },
    {
      id: "merchant-id",
      label: "Merchant ID",
      value: npsMerchantId(prefix),
      hint: "Send as MerchantId in signed requests and gateway forms.",
    },
    {
      id: "merchant-name",
      label: "Merchant name",
      value: prefix,
      hint: "Send as MerchantName. These lab identifiers change when you replace credentials.",
    },
  ],
  envExample: ({ baseUrl, secret, prefix }) => [
    {
      name: "NPS_API_URL",
      value: baseUrl,
    },
    {
      name: "NPS_GATEWAY_URL",
      value: `${baseUrl}/Payment/Index`,
    },
    {
      name: "NPS_API_USERNAME",
      value: prefix,
    },
    {
      name: "NPS_API_PASSWORD",
      value: secret,
    },
    {
      name: "NPS_SECRET_KEY",
      value: secret,
    },
    {
      name: "NPS_MERCHANT_ID",
      value: npsMerchantId(prefix),
    },
    {
      name: "NPS_MERCHANT_NAME",
      value: prefix,
    },
  ],
  registeredUrls: {
    note: "Save the Response URL before calling GetProcessId. Verify the transaction through CheckTransactionStatus after the browser returns.",
    fields: [
      {
        key: "responseUrl",
        label: "Response URL",
        help: "Default browser return. The gateway form can override this with ResponseUrl.",
        placeholder: "http://localhost:4100/nps/return",
      },
    ],
  },
  guide: [
    {
      title: "Use your lab environment values",
      paragraphs: [
        "In Connection, generate a lab key and copy the .env values into your local test environment. Use the variable names your app already reads.",
        "Replace the NPX API and gateway URLs, API username and password, signing secret, merchant ID, and merchant name. The lab password and signing secret use the same value. Keep your existing signing, process creation, gateway form, and status-check code.",
      ],
    },
    {
      title: "Register your browser return",
      paragraphs: [
        "Save your app's default Response URL in Registered URLs before creating a process. A gateway form's existing ResponseUrl can still override the browser return for that payment.",
        "Browser returns can use localhost. New processes capture the saved Response URL.",
      ],
    },
    {
      title: "Run a payment from your app",
      paragraphs: [
        "Leave Initiation response on Allow initiation. Use your usual GetProcessId and Payment/Index flow, then choose an outcome on checkout.",
        "The browser return contains transaction IDs, without a success or failure status. Your existing CheckTransactionStatus call receives the chosen result. The lab does not send webhooks.",
        "The lab exposes only the TMBANK test instrument and a fixed NPR 5 service charge. Use an instrument returned by the lab in your existing flow.",
      ],
    },
  ],
  documentationUrl: "https://apigateway.nepalpayment.com/Help",
} satisfies ProviderDefinition<"nps">;
