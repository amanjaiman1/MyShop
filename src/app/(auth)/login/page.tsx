import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string; error?: string }>;
}) {
  const { next, reset, error } = await searchParams;

  // First run? Offer the one-time owner setup instead of a sign-in that can't
  // possibly succeed. Defaults to "an owner exists" if we can't tell, so a
  // transient failure never exposes the setup path.
  let ownerExists = true;
  if (isSupabaseConfigured) {
    try {
      const supabase = await createClient();
      const { data, error: rpcError } = await supabase.rpc("owner_exists");
      if (!rpcError && typeof data === "boolean") ownerExists = data;
    } catch {
      // Leave ownerExists = true.
    }
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="eyebrow">{ownerExists ? "Welcome back" : "First-time setup"}</p>
        <h1 className="display-title text-[2rem] text-ink-strong">
          {ownerExists ? "Sign in to Aurelia" : "Create your shop"}
        </h1>
        <p className="text-sm leading-relaxed text-muted">
          {ownerExists
            ? "Your shop\u2019s inventory, costs and profit — all in one place."
            : "One account owns this shop. Set yours up and you\u2019re ready to trade."}
        </p>
      </header>

      {error === "link_expired" ? (
        <p
          role="alert"
          className="rounded-[--radius-sm] border border-lowprofit-border bg-lowprofit-soft px-3.5 py-3 text-sm text-lowprofit"
        >
          That link has expired or was already used. Sign in, or request a new
          reset link.
        </p>
      ) : null}

      <LoginForm
        nextPath={next}
        passwordWasReset={reset === "1"}
        ownerExists={ownerExists}
      />
    </div>
  );
}
