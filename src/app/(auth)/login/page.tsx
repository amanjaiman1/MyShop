import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const { next, reset } = await searchParams;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="eyebrow">Welcome back</p>
        <h1 className="display-title text-[2rem] text-ink-strong">Sign in to Aurelia</h1>
        <p className="text-sm leading-relaxed text-muted">
          Your shop&rsquo;s inventory, costs and profit — all in one place.
        </p>
      </header>

      <LoginForm nextPath={next} passwordWasReset={reset === "1"} />
    </div>
  );
}
