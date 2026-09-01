"use client";

import Link from "next/link";
import { Search, Settings, Sparkles } from "lucide-react";
import { useShop } from "@/components/providers/shop-provider";
import { cn } from "@/lib/utils";

/**
 * Compact top bar for phones. The desktop sidebar carries the brand and owner
 * menu, so this only appears below `lg`.
 */
export function MobileHeader() {
  const { shopName } = useShop();

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-[--header-h] items-center gap-3 border-b border-line lg:hidden",
        "bg-surface/90 px-4 backdrop-blur-md safe-top",
      )}
    >
      <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[--radius-sm] gradient-primary text-on-accent shadow-[--shadow-primary]">
          <Sparkles className="size-4" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="display-title block truncate text-base leading-none text-ink-strong">
            Aurelia
          </span>
          <span className="block truncate text-[0.625rem] text-subtle">{shopName}</span>
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-1">
        <Link
          href="/products"
          aria-label="Search products"
          className="flex size-10 items-center justify-center rounded-[--radius-sm] text-muted transition-colors hover:bg-surface-sunken hover:text-ink"
        >
          <Search className="size-[1.15rem]" aria-hidden />
        </Link>
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex size-10 items-center justify-center rounded-[--radius-sm] text-muted transition-colors hover:bg-surface-sunken hover:text-ink"
        >
          <Settings className="size-[1.15rem]" aria-hidden />
        </Link>
      </div>
    </header>
  );
}
