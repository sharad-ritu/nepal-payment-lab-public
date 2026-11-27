import type { RequestHandler } from "express";

// Single-process guard. Deployments with multiple replicas also need an edge limit.
export function rateLimit({
  limit,
  key,
  provider = false,
  errorBody,
}: {
  limit: number;
  key: (request: Parameters<RequestHandler>[0]) => string;
  provider?: boolean;
  errorBody?: Record<string, unknown>;
}): RequestHandler {
  const buckets = new Map<string, { count: number; until: number }>();
  const failure =
    errorBody ??
    (provider
      ? { detail: "Request was throttled." }
      : { kind: "rate_limited", message: "Try again in a minute." });
  return (request, response, next) => {
    const now = Date.now();
    const identity = key(request);
    let bucket = buckets.get(identity);
    if (!bucket || bucket.until <= now) {
      if (buckets.size >= 10000) {
        for (const [id, value] of buckets)
          if (value.until <= now) buckets.delete(id);
        if (buckets.size >= 10000) {
          response.status(429).json(failure);
          return;
        }
      }
      bucket = { count: 0, until: now + 60000 };
      buckets.set(identity, bucket);
    }
    bucket.count++;
    if (bucket.count > limit) {
      response.setHeader("Retry-After", Math.ceil((bucket.until - now) / 1000));
      response.status(429).json(failure);
      return;
    }
    next();
  };
}
