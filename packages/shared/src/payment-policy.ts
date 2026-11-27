import type { ConnectipsStatus } from "./connectips";
import type { EsewaStatus } from "./esewa";
import type { Provider } from "./providers";
import type { PaymentStatus } from "./scenarios";

export const providerCheckoutMinutes = {
  khalti: 30,
  esewa: 5,
  connectips: 60,
  nps: 60,
} satisfies Record<Provider, number>;

export const providerStatuses = {
  khalti: {
    initiated: "Pending",
    completed: "Completed",
    pending: "Pending",
    cancelled: "User canceled",
    expired: "Expired",
  },
  esewa: {
    initiated: "PENDING",
    completed: "COMPLETE",
    pending: "PENDING",
    cancelled: "CANCELED",
    expired: "NOT_FOUND",
  } satisfies Record<PaymentStatus, EsewaStatus>,
  connectips: {
    initiated: "ERROR",
    completed: "SUCCESS",
    pending: "ERROR",
    cancelled: "FAILED",
    expired: "ERROR",
  } satisfies Record<PaymentStatus, ConnectipsStatus>,
  nps: {
    initiated: "Pending",
    completed: "Success",
    pending: "Pending",
    cancelled: "Fail",
    expired: "Fail",
  },
} as const satisfies Record<Provider, Record<PaymentStatus, string>>;

export const esewaReturnStatuses = {
  ...providerStatuses.esewa,
  expired: "CANCELED",
} as const satisfies Record<PaymentStatus, EsewaStatus>;
