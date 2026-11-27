import { connectipsMerchantId } from "@nepal-payment-lab/shared";
import type { ProviderDefinition } from "./types";

const signingNote =
  "connectIPS uses your signing private key to generate TOKEN from the transaction details. Keep your existing token-generation code and test key configuration, whether you use CREDITOR.pfx, PEM, a base64-encoded key, or another keystore. Generate each TOKEN using the lab merchant and app IDs in the request. No lab-specific signing key or certificate is needed. The lab requires TOKEN but does not verify its RSA signature. The lab app password is only for Basic authentication.";

export const connectips = {
  id: "connectips",
  name: "connect IPS",
  productName: "Gateway checkout",
  apiBasePath: "/connectips",
  endpointLabel: "Lab base URL",
  endpointHint: "Replaces https://uat.connectips.com.",
  secretHint:
    "This is your app password: the Basic-auth password for payment validation and transaction details. TOKEN signing stays exactly as in production.",
  extraFields: ({ prefix }) => [
    {
      id: "merchant-id",
      label: "Merchant ID",
      value: connectipsMerchantId(prefix),
      hint: "Send MERCHANTID in the form and merchantId in validation calls.",
    },
    {
      id: "app-id",
      label: "App ID",
      value: prefix,
      hint: "Send this as APPID, and use it as the Basic-auth username. Lab app IDs are longer than live ones.",
    },
  ],
  envExample: ({ baseUrl, secret, prefix }) => [
    {
      name: "CONNECTIPS_BASE_URL",
      value: baseUrl,
    },
    {
      name: "CONNECTIPS_MERCHANT_ID",
      value: connectipsMerchantId(prefix),
    },
    {
      name: "CONNECTIPS_APP_ID",
      value: prefix,
    },
    {
      name: "CONNECTIPS_APP_PASSWORD",
      value: secret,
    },
    {
      name: "CONNECTIPS_APP_NAME",
      value: "My Shop",
      comment: "Example only. Keep your existing APPNAME, up to 30 characters.",
    },
  ],
  envNote: signingNote,
  registeredUrls: {
    note: "Save both URLs before posting the gateway form. Each new payment keeps the URLs registered when it was created.",
    fields: [
      {
        key: "successUrl",
        label: "Success URL",
        help: "Successful payments return here with TXNID appended.",
        placeholder: "http://localhost:4100/payments/connectips/success",
      },
      {
        key: "failureUrl",
        label: "Failure URL",
        help: "Canceled, pending, and expired payments return here with TXNID appended.",
        placeholder: "http://localhost:4100/payments/connectips/failure",
      },
    ],
  },
  guide: [
    {
      title: "Use your lab environment values",
      paragraphs: [
        "In Connection, generate a lab key and copy the .env values into your local test environment. Use the variable names your app already reads.",
        "Replace the connectIPS base URL, merchant ID, app ID, and app password. Keep your existing APPNAME, gateway form, signing code, and verification code. APPNAME is required and accepts up to 30 characters; My Shop in the .env block is an example.",
        signingNote,
      ],
    },
    {
      title: "Register your existing return URLs",
      paragraphs: [
        "Save your app's existing Success URL and Failure URL in Registered URLs. Both are required before a payment can reach checkout; localhost URLs work.",
        "You do not need to add return URLs to the gateway form. Each new payment keeps the URLs saved when it starts.",
      ],
    },
    {
      title: "Run a payment from your app",
      paragraphs: [
        "Leave Initiation response on Allow initiation. Submit your existing gateway form, choose a checkout outcome, and return to your app.",
        "The browser returns TXNID to the selected Success or Failure URL. Your existing validation and transaction-detail calls receive the selected verification response.",
      ],
    },
  ],
  documentationUrl:
    "https://doc.connectips.com/docs/connectIPS-Gateway/merchant-interface",
} satisfies ProviderDefinition<"connectips">;
