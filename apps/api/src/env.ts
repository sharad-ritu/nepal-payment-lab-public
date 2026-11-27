import { z } from "zod";

const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(45174),
  HOST: z.string().min(1).default("127.0.0.1"),
  WEB_ORIGIN: z.url().default("http://localhost:45173"),
  DATABASE_URL: z.url(),
});

export function loadEnvironment() {
  return environmentSchema.parse(process.env);
}
