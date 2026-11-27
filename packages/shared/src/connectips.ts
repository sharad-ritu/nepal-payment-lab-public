import { z } from "zod";

import { maxAmountMinor } from "./amounts";

export { labMerchantId as connectipsMerchantId } from "./credentials";

const merchantIdField = z
  .string()
  .regex(/^\d{1,20}$/, "Enter the lab merchant number.");

const txnDate = z
  .string()
  .regex(/^\d{2}-\d{2}-\d{4}$/, "Use DD-MM-YYYY.")
  .refine((value) => {
    const [day, month, year] = value.split("-").map(Number);
    if (!day || !month || !year) return false;
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Enter a real calendar date.");

const paisaAmount = z
  .string()
  .regex(/^\d{1,20}$/, "Enter a paisa amount.")
  .refine((value) => {
    const amount = Number(value);

    return (
      Number.isSafeInteger(amount) && amount >= 1 && amount <= maxAmountMinor
    );
  }, `Enter a paisa amount between 1 and ${maxAmountMinor}.`);

export const connectipsFormSchema = z.object({
  MERCHANTID: merchantIdField,
  APPID: z.string().trim().min(1, "This field may not be blank.").max(64),
  APPNAME: z.string().trim().min(1, "This field may not be blank.").max(30),
  TXNID: z.string().trim().min(1, "This field may not be blank.").max(20),
  TXNDATE: txnDate,
  TXNCRNCY: z.literal("NPR", "Only NPR is supported."),
  TXNAMT: paisaAmount,
  REFERENCEID: z.string().trim().min(1, "This field may not be blank.").max(20),
  REMARKS: z.string().trim().min(1, "This field may not be blank.").max(50),
  PARTICULARS: z
    .string()
    .trim()
    .min(1, "This field may not be blank.")
    .max(100),
  TOKEN: z.string().min(1, "This field may not be blank.").max(512),
});
// Like the live gateway, return destinations come from the merchant's
// registered Success and Failure URLs, so form fields such as SUCCESSURL are
// not part of this contract and are discarded during parsing.

const tokenField = z.string().min(1, "Send the request token.").max(512);

export const connectipsValidateSchema = z.object({
  merchantId: z
    .union([z.number().int().positive(), merchantIdField])
    .transform(String),
  appId: z.string().trim().min(1).max(64),
  referenceId: z.string().trim().min(1).max(20),
  txnAmt: z
    .union([z.number().int().min(1).max(maxAmountMinor), paisaAmount])
    .transform(String),
  token: tokenField,
});

const connectipsStatusSchema = z.enum(["SUCCESS", "FAILED", "ERROR"]);
export type ConnectipsStatus = z.infer<typeof connectipsStatusSchema>;

export const connectipsProviderDetailsSchema = z.object({
  appName: z.string(),
  referenceId: z.string(),
  remarks: z.string(),
  particulars: z.string(),
});
export type ConnectipsProviderDetails = z.infer<
  typeof connectipsProviderDetailsSchema
>;
