import "server-only";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { toAppError, type AppError } from "@/lib/errors";

/**
 * Shared plumbing for Server Actions.
 *
 * Every action returns a discriminated result rather than throwing, so forms
 * can render a precise message (including the "confirm the loss" prompt) instead
 * of hitting the generic error boundary.
 */

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

export function success<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function failure(error: unknown): ActionResult<never> {
  return { ok: false, error: toAppError(error) };
}

/** Resolve the signed-in owner and an RLS-scoped client, or fail cleanly. */
export async function withOwner<T>(
  fn: (ctx: {
    userId: string;
    supabase: Awaited<ReturnType<typeof createClient>>;
  }) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        ok: false,
        error: {
          code: "28000",
          message: "Your session has expired. Please sign in again.",
          needsConfirmation: false,
        },
      };
    }
    const supabase = await createClient();
    return await fn({ userId: user.id, supabase });
  } catch (error) {
    return failure(error);
  }
}
