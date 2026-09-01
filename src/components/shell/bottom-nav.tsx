"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BOTTOM_NAV, isNavItemActive } from "./nav-config";
import { cn } from "@/lib/utils";

/**
 * Mobile bottom navigation.
 *
 * Scan/Sell is the centre item and is rendered as a raised, gradient-filled
 * button that breaks the bar's baseline — the single most-used action in the app
 * should be impossible to miss and reachable with one thumb.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 lg:hidden",
        "border-t border-line bg-surface/92 backdrop-blur-md",
        "pb-[env(safe-area-inset-bottom)]",
        "shadow-[0_-6px_24px_-12px_rgba(74,51,42,0.18)]",
      )}
    >
      <ul className="grid h-[--bottom-nav-h] grid-cols-5 items-center">
        {BOTTOM_NAV.map((item) => {
          const active = isNavItemActive(item, pathname);
          const isPrimary = item.href === "/sell";

          if (isPrimary) {
            return (
              <li key={item.href} className="flex items-start justify-center">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label="Scan and sell"
                  className="group -mt-6 flex flex-col items-center gap-1"
                >
                  <span
                    className={cn(
                      "flex size-[3.5rem] items-center justify-center rounded-[--radius-xl]",
                      "gradient-primary text-on-accent shadow-[--shadow-primary]",
                      "ring-4 ring-[--surface]",
                      "transition-transform duration-[--dur] ease-[--ease-out] active:scale-95",
                      active && "pulse-ring",
                    )}
                  >
                    <item.icon className="size-6" strokeWidth={2} aria-hidden />
                  </span>
                  <span
                    className={cn(
                      "text-[0.625rem] font-semibold tracking-wide",
                      active ? "text-primary" : "text-muted",
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          }

          return (
            <li key={item.href} className="flex justify-center">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[--tap-target] w-full flex-col items-center justify-center gap-1 rounded-[--radius-sm]",
                  "transition-colors duration-[--dur]",
                  active ? "text-primary" : "text-muted active:bg-surface-sunken",
                )}
              >
                <item.icon
                  className="size-[1.3rem]"
                  strokeWidth={active ? 2.1 : 1.75}
                  aria-hidden
                />
                <span className="text-[0.625rem] leading-none font-medium">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
