import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Premium empty state.
 *
 * An empty screen is a teaching moment, so every one of these says what the
 * screen is for and offers the single next action — never just "No data".
 */
export function EmptyState({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  secondaryAction,
  className,
  compact = false,
}: {
  icon: LucideIcon;
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[--radius-lg] border border-dashed border-line-strong",
        "bg-surface/60 text-center",
        compact ? "gap-3 px-5 py-8" : "gap-4 px-6 py-14",
        className,
      )}
    >
      <span
        className={cn(
          "relative flex items-center justify-center rounded-[--radius-xl] gradient-champagne",
          "border border-[--gold-soft] shadow-sm",
          compact ? "size-12" : "size-16",
        )}
      >
        <Icon
          className={cn("text-gold", compact ? "size-5" : "size-7")}
          strokeWidth={1.5}
          aria-hidden
        />
      </span>

      <div className="max-w-sm space-y-1.5">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h3 className={cn("display-title text-ink-strong", compact ? "text-lg" : "text-xl")}>
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-muted">{description}</p>
      </div>

      {action || secondaryAction ? (
        <div className="mt-1 flex flex-col items-center gap-2 sm:flex-row">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
