import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Every suite gets a separate schema and pool. Never migrate or truncate public.
export async function openTestDatabase() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "Set TEST_DATABASE_URL to a PostgreSQL test database before running integration tests.",
    );
  }
  const schema = `lab_test_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(url, { max: 1 });
  const client = postgres(url, {
    max: 5,
    connection: { search_path: schema },
  });
  const db = drizzle(client);

  async function close() {
    try {
      await client.end({ timeout: 5 });
    } finally {
      try {
        await admin.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
  }

  try {
    await admin.unsafe(`CREATE SCHEMA "${schema}"`);
    const migrations = readMigrationFiles({
      migrationsFolder: fileURLToPath(
        new URL("../../migrations", import.meta.url),
      ),
    });
    await client.begin(async (connection) => {
      for (const migration of migrations) {
        for (const statement of migration.sql) {
          // Checked-in foreign keys explicitly qualify public. Apply that same
          // migration to the isolated schema instead of referencing real tables.
          await connection.unsafe(
            statement.replaceAll('"public".', `"${schema}".`),
          );
        }
      }
    });
    return { db, close };
  } catch (error) {
    await close();
    throw error;
  }
}
