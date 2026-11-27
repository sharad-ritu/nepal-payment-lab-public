import type { ProviderDefinition } from "./types";

export const esewa = {
  id: "esewa",
  name: "eSewa",
  productName: "ePay checkout",
  apiBasePath: "/esewa",
  endpointLabel: "Lab base URL",
  endpointHint:
    "Replaces https://rc-epay.esewa.com.np for the form and https://rc.esewa.com.np for status checks.",
  secretHint:
    "Use it to sign payment requests and to verify success responses with HMAC-SHA256.",
  extraFields: ({ prefix }) => [
    {
      id: "product-code",
      label: "Product code",
      value: prefix,
      hint: "Send this as product_code. It identifies your account, so keep it with the secret.",
    },
  ],
  envExample: ({ baseUrl, secret, prefix }) => [
    {
      name: "ESEWA_FORM_URL",
      value: `${baseUrl}/api/epay/main/v2/form`,
    },
    {
      name: "ESEWA_STATUS_URL",
      value: `${baseUrl}/api/epay/transaction/status`,
    },
    {
      name: "ESEWA_PRODUCT_CODE",
      value: prefix,
    },
    {
      name: "ESEWA_SECRET_KEY",
      value: secret,
    },
  ],
  registeredUrls: null,
  guide: [
    {
      title: "Use your lab environment values",
      paragraphs: [
        "In Connection, generate a lab key and copy the .env values into your local test environment. Use the variable names your app already reads.",
        "Replace both the eSewa form and status URLs, the product code, and the signing secret. Keep your existing form, HMAC signing, return handling, and status-check code.",
      ],
    },
    {
      title: "Run a payment from your app",
      paragraphs: [
        "Leave Initiation response on Allow initiation. Submit a payment through your existing eSewa checkout and choose an outcome on the lab checkout page.",
        "Keep your existing success_url and failure_url, including localhost URLs. The lab attaches signed data to both returns. Expiry returns CANCELED to the browser and NOT_FOUND from the status check.",
      ],
    },
  ],
  documentationUrl: "https://developer.esewa.com.np/pages/Epay",
} satisfies ProviderDefinition<"esewa">;
