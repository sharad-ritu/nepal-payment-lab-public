import { expect, test } from "bun:test";
import type { Provider } from "@nepal-payment-lab/shared";
import { getProvider, providerApiUrl } from "../lib/providers";

const prefix = "lab_test_000001000000000000000000";
const secret = `${prefix}.${"s".repeat(43)}`;
const origin = "http://localhost:4000";

const environments = [
  {
    provider: "khalti",
    baseUrl: `${origin}/khalti/api/v2`,
    entries: [
      { name: "KHALTI_BASE_URL", value: `${origin}/khalti/api/v2` },
      { name: "KHALTI_SECRET_KEY", value: secret },
    ],
  },
  {
    provider: "esewa",
    baseUrl: `${origin}/esewa`,
    entries: [
      {
        name: "ESEWA_FORM_URL",
        value: `${origin}/esewa/api/epay/main/v2/form`,
      },
      {
        name: "ESEWA_STATUS_URL",
        value: `${origin}/esewa/api/epay/transaction/status`,
      },
      { name: "ESEWA_PRODUCT_CODE", value: prefix },
      { name: "ESEWA_SECRET_KEY", value: secret },
    ],
  },
  {
    provider: "connectips",
    baseUrl: `${origin}/connectips`,
    entries: [
      { name: "CONNECTIPS_BASE_URL", value: `${origin}/connectips` },
      { name: "CONNECTIPS_MERCHANT_ID", value: "100001" },
      { name: "CONNECTIPS_APP_ID", value: prefix },
      { name: "CONNECTIPS_APP_PASSWORD", value: secret },
      {
        name: "CONNECTIPS_APP_NAME",
        value: "My Shop",
        comment:
          "Example only. Keep your existing APPNAME, up to 30 characters.",
      },
    ],
  },
  {
    provider: "nps",
    baseUrl: `${origin}/nps`,
    entries: [
      { name: "NPS_API_URL", value: `${origin}/nps` },
      { name: "NPS_GATEWAY_URL", value: `${origin}/nps/Payment/Index` },
      { name: "NPS_API_USERNAME", value: prefix },
      { name: "NPS_API_PASSWORD", value: secret },
      { name: "NPS_SECRET_KEY", value: secret },
      { name: "NPS_MERCHANT_ID", value: "100001" },
      { name: "NPS_MERCHANT_NAME", value: prefix },
    ],
  },
] satisfies {
  provider: Provider;
  baseUrl: string;
  entries: ReturnType<ReturnType<typeof getProvider>["envExample"]>;
}[];

test.each(environments)(
  "$provider environment examples use lab endpoints and credential identities",
  ({ provider: id, baseUrl, entries }) => {
    const provider = getProvider(id);

    for (const apiOrigin of [origin, `${origin}/`]) {
      expect(
        providerApiUrl({
          provider,
          origin: apiOrigin,
        }),
      ).toBe(baseUrl);
    }
    expect(
      provider.envExample({
        baseUrl,
        secret,
        prefix,
      }),
    ).toEqual(entries);
  },
);

test("NPX branding preserves the nps integration identifier and URLs", () => {
  const provider = getProvider("nps");

  expect(provider.id).toBe("nps");
  expect(provider.name).toBe("NPX");
  expect(provider.apiBasePath).toBe("/nps");
  expect(provider.documentationUrl).toBe(
    "https://apigateway.nepalpayment.com/Help",
  );
});
