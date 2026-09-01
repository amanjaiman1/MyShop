"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Error boundary for any page inside the app shell. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production this is where a logger (Sentry, etc.) would receive it.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-[--radius-xl] bg-loss-soft border border-loss-border">
        <AlertTriangle className="size-7 text-loss" strokeWidth={1.5} aria-hidden />
      </span>
      <p className="eyebrow mt-6">Something broke</p>
      <h1 className="display-title mt-2 text-2xl text-ink-strong">We couldn&rsquo;t load this</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
        An unexpected error stopped this page from loading. Your records are safe.
        Try again, and if it keeps happening, check your connection.
      </p>
      <Button onClick={reset} className="mt-6">
        <RotateCcw aria-hidden />
        Try again
      </Button>
    </div>
  );
}
