"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Eye, EyeOff, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";
import { toAuthErrorMessage } from "@/lib/errors";
import { loginSchema, type LoginValues } from "@/lib/schemas";
import { cn } from "@/lib/utils";

export function LoginForm({
  nextPath,
  passwordWasReset = false,
}: {
  nextPath?: string;
  passwordWasReset?: boolean;
}) {
  const router = useRouter();
  const [showPassword, setShowPassword] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setFormError(null);
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });

    if (error) {
      setFormError(toAuthErrorMessage(error));
      form.setFocus("password");
      return;
    }

    // Only allow internal destinations — an open redirect here would be a
    // phishing vector on a page that asks for a password.
    const destination =
      nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
        ? nextPath
        : "/dashboard";

    router.replace(destination);
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
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
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <FormControl>
                <div className="relative">
                  <Input
                    {...field}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Your password"
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
          loadingText="Signing in…"
        >
          <LogIn aria-hidden />
          Sign in
        </Button>

        <p className="text-center text-xs leading-relaxed text-muted">
          Aurelia is a single-owner ledger, so there is no public sign-up. If you
          need an account, create it in your Supabase project.
        </p>
      </form>
    </Form>
  );
}
