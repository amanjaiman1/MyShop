import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-8">
      <Link
        href="/login"
        className="-ml-1.5 inline-flex h-9 items-center gap-1 rounded-[--radius-xs] pr-2.5 pl-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-ink"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Back to sign in
      </Link>

      <header className="space-y-2">
        <p className="eyebrow">Account recovery</p>
        <h1 className="display-title text-[2rem] text-ink-strong">Reset your password</h1>
        <p className="text-sm leading-relaxed text-muted">
          Enter the email you sign in with and we&rsquo;ll send you a secure link
          to choose a new password.
        </p>
      </header>

      <ForgotPasswordForm />
    </div>
  );
}
