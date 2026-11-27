import { defineConfig } from "drizzle-kit";
import { z } from "zod";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  ...(process.env.DATABASE_URL
    ? {
        dbCredentials: { url: z.url().parse(process.env.DATABASE_URL) },
      }
    : {}),
});
