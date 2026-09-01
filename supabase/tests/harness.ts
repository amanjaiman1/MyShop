/**
 * Local database test harness.
 *
 * Applies the Supabase shim + every migration to a throwaway PostgreSQL, then
 * lets test files run assertions as a real `authenticated` role with JWT claims
 * set, so RLS is genuinely in force.
 *
 * Not shipped to production; see supabase/tests/README.md.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";

// Keep money and dates exact: bigint -> number (safe below 2^53 paise),
// numeric -> number, date -> plain "YYYY-MM-DD" string, no timezone shifting.
pg.types.setTypeParser(20, (v) => Number(v)); // int8
pg.types.setTypeParser(1700, (v) => Number(v)); // numeric
pg.types.setTypeParser(1082, (v) => v); // date

/** Repo root, overridable so the suite can also run inside a container image. */
export const ROOT = process.env.AURELIA_ROOT ?? path.resolve(import.meta.dirname, "../..");

export const client = new pg.Client({
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 55432),
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD ?? "postgres",
  database: process.env.PGDATABASE ?? "aurelia",
});

let failures = 0;
let assertions = 0;
let currentSuite = "";

export function suite(name: string): void {
  currentSuite = name;
  console.log(`\n\x1b[1m\x1b[35m${name}\x1b[0m`);
}

export function ok(condition: boolean, message: string): void {
  assertions += 1;
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${message}`);
  } else {
    failures += 1;
    console.log(`  \x1b[31m✗ ${message}\x1b[0m  [${currentSuite}]`);
  }
}

export function eq(actual: unknown, expected: unknown, message: string): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  ok(same, same ? message : `${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

export async function throwsWithCode(
  fn: () => Promise<unknown>,
  code: string,
  message: string,
): Promise<void> {
  try {
    await fn();
    ok(false, `${message} (no error was raised)`);
  } catch (error) {
    const actual = (error as { code?: string }).code;
    ok(actual === code, actual === code ? message : `${message} — expected SQLSTATE ${code}, got ${actual}: ${(error as Error).message}`);
  }
}

export async function q<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await client.query(sql, params);
  return result.rows as T[];
}

export async function one<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const rows = await q<T>(sql, params);
  if (rows.length === 0) throw new Error(`Expected a row from: ${sql}`);
  return rows[0] as T;
}

/** Run statements as the given owner, with RLS active. */
export async function asOwner<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await client.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  await client.query("set role authenticated");
  try {
    return await fn();
  } finally {
    await client.query("reset role");
    await client.query(`select set_config('request.jwt.claims', '', false)`);
  }
}

export async function migrate(): Promise<void> {
  await client.query(`
    drop schema if exists public cascade;
    drop schema if exists auth cascade;
    drop schema if exists storage cascade;
    create schema public;
  `);
  await client.query(readFileSync(path.join(ROOT, "supabase/tests/00_supabase_shim.sql"), "utf8"));

  const dir = path.join(ROOT, "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await client.query(readFileSync(path.join(dir, file), "utf8"));
    } catch (error) {
      console.error(`\n\x1b[31mMigration failed: ${file}\x1b[0m`);
      console.error((error as Error).message);
      throw error;
    }
  }
  console.log("\x1b[32mAll migrations applied.\x1b[0m");
}

export async function createOwner(email: string, timezone = "Asia/Kolkata"): Promise<string> {
  const row = await one<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data)
     values ($1, jsonb_build_object('display_name', 'Test Owner', 'shop_name', 'Test Boutique'))
     returning id`,
    [email],
  );
  await client.query(`update public.profiles set timezone = $2 where id = $1`, [row.id, timezone]);
  return row.id;
}

export function finish(): never {
  console.log(
    `\n${failures === 0 ? "\x1b[32m" : "\x1b[31m"}${assertions - failures}/${assertions} assertions passed\x1b[0m`,
  );
  if (failures > 0) {
    console.log(`\x1b[31m${failures} FAILURE(S)\x1b[0m`);
    process.exit(1);
  }
  console.log("\x1b[32mDATABASE SUITE PASSED\x1b[0m");
  process.exit(0);
}

/** ₹ helper: rupees -> paise (integer minor units). */
export const inr = (rupees: number): number => Math.round(rupees * 100);
