import { z } from "zod";

/**
 * Supabase configuration resolution.
 *
 * ── Where values come from ──────────────────────────────────────────────────
 * The browser can only read `NEXT_PUBLIC_`‑prefixed variables, and Next.js
 * inlines them at BUILD time — so those are the source of truth for the client.
 * On the server we also accept the names the official Supabase↔Vercel
 * integration creates (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, …) as a fallback,
 * so a project wired up purely through that integration still works
 * server‑side.
 *
 * ── Why it no longer throws at import ───────────────────────────────────────
 * Throwing at module load broke `next build` (page‑data collection imports
 * these modules). Instead we resolve the values lazily and only raise a
 * friendly error when a Supabase client is actually created at runtime without
 * configuration — the build succeeds, and a genuinely misconfigured deployment
 * fails with an actionable message rather than a cryptic stack trace.
 */

// NOTE: reference `process.env.NEXT_PUBLIC_*` literally so Next.js inlines them
// into the client bundle. The non‑prefixed fallbacks are server‑only (they are
// `undefined` in the browser, which is fine — the client always has the
// NEXT_PUBLIC values).
const RAW_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";

const RAW_ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "";

const RAW_SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "";

const schema = z.object({
  url: z.string().url(),
  anon: z.string().min(20),
});

const parsed = schema.safeParse({ url: RAW_URL, anon: RAW_ANON });

export const isSupabaseConfigured = parsed.success;

/**
 * Resolved values. When unconfigured these are empty strings; callers must go
 * through `assertSupabaseConfig()` (below) before constructing a client so the
 * failure is explained clearly.
 */
export const env = {
  NEXT_PUBLIC_SUPABASE_URL: RAW_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: RAW_ANON,
  NEXT_PUBLIC_SITE_URL: RAW_SITE || undefined,
} as const;

let warned = false;

/**
 * Throws a human‑readable error if Supabase isn't configured. Called by the
 * browser and server client factories. Safe to call repeatedly.
 */
export function assertSupabaseConfig(): void {
  if (parsed.success) return;

  const issues = parsed.error.issues
    .map((i) => {
      if (i.path[0] === "url") {
        return "  • NEXT_PUBLIC_SUPABASE_URL is missing or not a full URL (e.g. https://xyz.supabase.co)";
      }
      if (i.path[0] === "anon") {
        return "  • NEXT_PUBLIC_SUPABASE_ANON_KEY is missing — copy it from Supabase → Project Settings → API";
      }
      return `  • ${i.message}`;
    })
    .join("\n");

  throw new Error(
    `Supabase is not configured.\n${issues}\n\n` +
      `Locally: copy .env.example to .env.local and fill in your project values.\n` +
      `On Vercel: add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and ` +
      `NEXT_PUBLIC_SITE_URL in Project Settings → Environment Variables, then redeploy.`,
  );
}

/** Non-fatal heads-up during a build with no env configured. */
if (!parsed.success && !warned && typeof window === "undefined") {
  warned = true;
  console.warn(
    "[aurelia] Supabase env not detected at build time. The app will build, " +
      "but set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (and " +
      "redeploy) before it can connect.",
  );
}

/** Canonical origin, used to build Supabase Auth redirect links. */
export function siteUrl(): string {
  if (env.NEXT_PUBLIC_SITE_URL) return env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
