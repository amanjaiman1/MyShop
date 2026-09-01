"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck, Send } from "lucide-react";
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
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/lib/schemas";

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordValues) {
    setFormError(null);
    const supabase = createClient();

    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (error) {
      setFormError(toAuthErrorMessage(error));
      return;
    }
    setSentTo(values.email);
  }

  if (sentTo) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-[--radius-md] border border-profit-border bg-profit-soft px-4 py-4">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-profit" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium text-profit">Check your inbox</p>
            <p className="text-sm leading-relaxed text-profit-strong/80">
              We sent a password reset link to <strong>{sentTo}</strong>. The link
              works once and expires shortly, so use it soon.
            </p>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Nothing arrived? Check your spam folder, or{" "}
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            try a different email
          </button>
          .
        </p>
        <Button variant="outline" block asChild>
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
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
              <FormDescription>
                For your security we always show the same confirmation, whether or
                not an account exists.
              </FormDescription>
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
          loadingText="Sending…"
        >
          <Send aria-hidden />
          Send reset link
        </Button>
      </form>
    </Form>
  );
}
