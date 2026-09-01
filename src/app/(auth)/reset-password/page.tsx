import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="eyebrow">Almost there</p>
        <h1 className="display-title text-[2rem] text-ink-strong">Choose a new password</h1>
        <p className="text-sm leading-relaxed text-muted">
          Pick something you have not used before. Aurelia never stores your
          password — Supabase Auth handles it.
        </p>
      </header>

      <ResetPasswordForm />
    </div>
  );
}
