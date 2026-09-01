"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Eye, EyeOff, LogIn, MailCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";
import { toAuthErrorMessage } from "@/lib/errors";
import { loginSchema, type LoginValues } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/**
 * Sign in — and, on a brand-new deployment, create the single owner account.
 *
 * `ownerExists` comes from the server. When it is false this is the shop's
 * first run, so the form switches to "Create your shop": the owner signs
 * themselves up once, and the database trigger seeds their profile and default
 * categories. After that this branch is unreachable and the screen is
 * sign-in only — there is no ongoing public registration.
 */
export function LoginForm({
  nextPath,
  passwordWasReset = false,
  ownerExists = true,
}: {
  nextPath?: string;
  passwordWasReset?: boolean;
  ownerExists?: boolean;
}) {
  const router = useRouter();
  const [showPassword, setShowPassword] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [confirmSent, setConfirmSent] = React.useState(false);

  const isFirstRun = !ownerExists;

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setFormError(null);
    const supabase = createClient();

    // Only allow internal destinations — an open redirect on a password screen
    // would be a phishing vector.
    const destination =
      nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
        ? nextPath
        : "/dashboard";

    if (isFirstRun) {
      if (values.password.length < 8) {
        form.setError("password", { message: "Use at least 8 characters." });
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });

      if (error) {
        setFormError(toAuthErrorMessage(error));
        return;
      }

      // With email confirmation enabled, Supabase returns no session — the
      // owner must click the link first. Say so instead of failing silently.
      if (!data.session) {
        setConfirmSent(true);
        return;
      }

      router.replace(destination);
      router.refresh();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });

    if (error) {
      setFormError(toAuthErrorMessage(error));
      form.setFocus("password");
      return;
    }

    router.replace(destination);
    router.refresh();
  }

  if (confirmSent) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-[--radius-md] border border-profit-border bg-profit-soft px-4 py-4">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-profit" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium text-profit">Confirm your email</p>
            <p className="text-sm leading-relaxed text-profit-strong/80">
              We sent a confirmation link to{" "}
              <strong>{form.getValues("email")}</strong>. Click it and you&rsquo;ll
              be signed straight into your shop.
            </p>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Want to skip confirmation emails? In Supabase go to{" "}
          <strong>Authentication → Providers → Email</strong> and turn off
          &ldquo;Confirm email&rdquo;, then create the account again.
        </p>
        <Button variant="outline" block onClick={() => setConfirmSent(false)}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {isFirstRun ? (
          <div className="flex items-start gap-3 rounded-[--radius-md] border border-line-accent bg-primary-soft px-4 py-3.5">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p className="text-sm leading-relaxed text-primary">
              <strong>Welcome to Aurelia.</strong> This shop has no owner yet —
              choose your email and password below to claim it. This only happens
              once.
            </p>
          </div>
        ) : null}

        {passwordWasReset ? (
          <p
            role="status"
            className={cn(
              "flex items-start gap-2 rounded-[--radius-sm] border border-profit-border bg-profit-soft",
              "px-3.5 py-3 text-sm text-profit",
            )}
          >
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            Your password has been changed. Sign in with your new password.
          </p>
        ) : null}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="owner@yourshop.com"
                  autoFocus
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Password</FormLabel>
                {!isFirstRun ? (
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Forgot password?
                  </Link>
                ) : null}
              </div>
              <FormControl>
                <div className="relative">
                  <Input
                    {...field}
                    type={showPassword ? "text" : "password"}
                    autoComplete={isFirstRun ? "new-password" : "current-password"}
                    placeholder={isFirstRun ? "Choose a strong password" : "Your password"}
                    className="pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className={cn(
                      "absolute inset-y-0 right-0 flex w-11 items-center justify-center",
                      "rounded-r-[--radius-sm] text-muted transition-colors hover:text-ink",
                    )}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" aria-hidden />
                    ) : (
                      <Eye className="size-4" aria-hidden />
                    )}
                  </button>
                </div>
              </FormControl>
              {isFirstRun ? (
                <FormDescription>At least 8 characters.</FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        {formError ? (
          <p
            role="alert"
            className="rounded-[--radius-sm] border border-loss-border bg-loss-soft px-3.5 py-3 text-sm text-loss"
          >
            {formError}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          block
          loading={form.formState.isSubmitting}
          loadingText={isFirstRun ? "Creating your shop…" : "Signing in…"}
        >
          {isFirstRun ? <Sparkles aria-hidden /> : <LogIn aria-hidden />}
          {isFirstRun ? "Create my shop" : "Sign in"}
        </Button>

        <p className="text-center text-xs leading-relaxed text-muted">
          {isFirstRun
            ? "Aurelia is a single-owner ledger. Once your shop is created, this screen becomes sign-in only."
            : "Aurelia is a single-owner ledger, so there is no public sign-up."}
        </p>
      </form>
    </Form>
  );
}
