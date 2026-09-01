"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, ShieldAlert } from "lucide-react";
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
import { resetPasswordSchema, type ResetPasswordValues } from "@/lib/schemas";

export function ResetPasswordForm() {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const [sessionState, setSessionState] = React.useState<"checking" | "ready" | "invalid">(
    "checking",
  );

  // The recovery link puts a temporary session on the client. Without it there
  // is nothing to update, so say so rather than failing on submit.
  React.useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setSessionState(data.session ? "ready" : "invalid");
    });
  }, []);

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });

  async function onSubmit(values: ResetPasswordValues) {
    setFormError(null);
    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setFormError(toAuthErrorMessage(error));
      return;
    }

    // Force a clean sign-in with the new credentials.
    await supabase.auth.signOut();
    router.replace("/login?reset=1");
  }

  if (sessionState === "invalid") {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-[--radius-md] border border-loss-border bg-loss-soft px-4 py-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-loss" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium text-loss">This link is no longer valid</p>
            <p className="text-sm leading-relaxed text-loss-strong/80">
              Reset links can only be used once and expire quickly. Request a new
              one and it will work straight away.
            </p>
          </div>
        </div>
        <Button block asChild>
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input {...field} type="password" autoComplete="new-password" autoFocus />
              </FormControl>
              <FormDescription>
                At least 10 characters, with an upper-case letter, a lower-case
                letter and a number.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm new password</FormLabel>
              <FormControl>
                <Input {...field} type="password" autoComplete="new-password" />
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
          disabled={sessionState !== "ready"}
          loading={form.formState.isSubmitting}
          loadingText="Saving…"
        >
          <KeyRound aria-hidden />
          Save new password
        </Button>
      </form>
    </Form>
  );
}
