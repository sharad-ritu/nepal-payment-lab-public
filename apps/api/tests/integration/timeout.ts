import { spyOn } from "bun:test";
import { setTimeout as nativeSetTimeout } from "node:timers";

// Capture the clock boundary without advancing socket/database timers or
// waiting a minute. The route still installs and clears its real timer.
export function captureTimeout() {
  const original = nativeSetTimeout;
  const state: { expire: () => void } = {
    expire: () => {
      throw new Error("No provider timeout was scheduled.");
    },
  };
  let expired = false;
  let notify = () => {};
  const scheduled = new Promise<void>((resolve) => {
    notify = resolve;
  });
  const intercept = Object.assign(
    (...parameters: Parameters<typeof globalThis.setTimeout>) => {
      const [handler, delay, ...args] = parameters;
      // Bun may retry an idempotent GET after the server closes its socket.
      // Keep the same advanced timeout boundary for any retried request.
      const timer = original(
        handler,
        expired && delay === 60000 ? 0 : delay,
        ...args,
      );
      if (delay === 60000) {
        state.expire = () => handler(...args);
        notify();
      }
      return timer;
    },
    original,
  );
  spyOn(globalThis, "setTimeout").mockImplementation(intercept);
  return {
    scheduled,
    expire: () => {
      expired = true;
      state.expire();
    },
  };
}
