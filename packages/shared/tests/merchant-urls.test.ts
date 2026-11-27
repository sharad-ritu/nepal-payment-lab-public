import { expect, test } from "bun:test";
import { merchantUrlSchema } from "../src/merchant-urls";
import {
  providerRegisteredUrlKeys,
  providerSettingsSchema,
} from "../src/providers";

test.each([
  "http://localhost:4100/payments/return",
  "https://merchant.test/return?existing=keep",
  "http://host.docker.internal:4100/nps/return",
])("accepts the merchant URL %s", (url) => {
  expect(merchantUrlSchema.parse(url)).toBe(url);
});

test.each([
  "file:///tmp/return",
  "javascript:alert(1)",
  "https://user:password@merchant.test/return",
  "https://user@merchant.test/return",
  "https://:password@merchant.test/return",
  "https://us%65r:p%40ssword@merchant.test/return",
  "ftp://merchant.test/return",
  "not a url",
  "",
  "/payments/return",
  "https://",
  "http://[invalid]/return",
])("rejects the merchant URL %s", (url) => {
  const result = merchantUrlSchema.safeParse(url);

  expect(result.success).toBe(false);
  expect(result.error?.issues[0]?.message).toBe(
    "Use an HTTP or HTTPS URL without embedded credentials.",
  );
});

test("lists registered URLs for the providers that use them", () => {
  expect(providerRegisteredUrlKeys("khalti")).toEqual([]);
  expect(providerRegisteredUrlKeys("esewa")).toEqual([]);
  expect(providerRegisteredUrlKeys("connectips")).toEqual([
    "successUrl",
    "failureUrl",
  ]);
  expect(providerRegisteredUrlKeys("nps")).toEqual(["responseUrl"]);
});

test("settings updates accept partial changes and cleared URLs", () => {
  expect(providerSettingsSchema.parse({ initiationMode: "timeout" })).toEqual({
    initiationMode: "timeout",
  });
  expect(
    providerSettingsSchema.parse({
      successUrl: "http://merchant.test/success",
      failureUrl: null,
    }),
  ).toEqual({
    successUrl: "http://merchant.test/success",
    failureUrl: null,
  });
});

test.each([
  {},
  { unexpected: "value" },
  { successUrl: "file:///tmp/success" },
  { successUrl: "not a url" },
  { failureUrl: "/payments/return" },
  { initiationMode: "unknown" },
])("settings updates reject %j", (input) => {
  expect(providerSettingsSchema.safeParse(input).success).toBe(false);
});

test.each(["successUrl", "failureUrl", "responseUrl"])(
  "%s accepts cleared URLs and rejects malformed URLs without throwing",
  (key) => {
    expect(providerSettingsSchema.parse({ [key]: null })).toEqual({
      [key]: null,
    });
    for (const url of ["not a url", "http://[invalid]/return", "https://"]) {
      const result = providerSettingsSchema.safeParse({ [key]: url });

      expect(result.success).toBe(false);
      expect(result.error?.issues).toEqual([
        expect.objectContaining({
          path: [key],
          message: "Use an HTTP or HTTPS URL without embedded credentials.",
        }),
      ]);
    }
  },
);
