import { z } from "zod";

/**
 * Fail fast, and fail with a sentence that says what to do.
 *
 * Only NEXT_PUBLIC_* values live here. The service-role key is deliberately
 * absent: it is used exclusively by local scripts and must never be reachable
 * from anything that renders.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a full URL, e.g. https://xyz.supabase.co"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(20, "NEXT_PUBLIC_SUPABASE_ANON_KEY looks too short — copy it from Supabase → Data API"),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

const parsed = publicEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  • ${i.message}`).join("\n");
  throw new Error(
    `Supabase is not configured.\n${issues}\n\nCopy .env.example to .env.local and fill in your project values.`,
  );
}

export const env = parsed.data;

/** Canonical origin, used to build auth redirect links. */
export function siteUrl(): string {
  if (env.NEXT_PUBLIC_SITE_URL) return env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
