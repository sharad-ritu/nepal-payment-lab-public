import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export * from "./repositories/nps";
export * from "./repositories/payments";
export * from "./repositories/providers";

export type { PaymentRecord, ProviderAccountRecord } from "./schema";

export function createDatabase({ url }: { url: string }) {
  const client = postgres(url, { max: 5 });

  return { db: drizzle(client), close: () => client.end() };
}

export type Database = ReturnType<typeof createDatabase>["db"];
