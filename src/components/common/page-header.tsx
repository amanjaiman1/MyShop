import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Editorial page header: a champagne hairline, a serif display title and
 * generous breathing room. Used once at the top of every screen so the app has
 * a consistent rhythm.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  backHref,
  backLabel = "Back",
  className,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className={cn("space-y-4", className)}>
      {backHref ? (
        <Link
          href={backHref}
          className={cn(
            "-ml-1.5 inline-flex h-9 items-center gap-1 rounded-[--radius-xs] pr-2.5 pl-1.5",
            "text-sm font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-ink",
          )}
        >
          <ChevronLeft className="size-4" aria-hidden />
          {backLabel}
        </Link>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1 className="display-title text-[1.75rem] text-ink-strong sm:text-[2.125rem]">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      <div className="rule-champagne" aria-hidden />
      {children}
    </header>
  );
}

/** Section heading inside a page. */
export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0 space-y-0.5">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-strong">{title}</h2>
        {description ? <p className="text-xs leading-relaxed text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
