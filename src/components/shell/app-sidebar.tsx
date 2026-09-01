"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, ScanLine, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/misc";
import { NAV_SECTIONS, isNavItemActive } from "./nav-config";
import { useShop } from "@/components/providers/shop-provider";
import { cn, initials } from "@/lib/utils";

const STORAGE_KEY = "aurelia:sidebar-collapsed";

/**
 * Desktop sidebar. Collapses to an icon rail so a 13" laptop still gets a wide
 * content column; the choice is remembered per device.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const { shopName, displayName } = useShop();
  // Read the remembered preference from localStorage after mount. It cannot be
  // the initial state (the server has no localStorage, so it would hydrate
  // mismatched), and it is deferred to a microtask so the first paint isn't
  // interrupted by a synchronous state update.
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    const t = window.setTimeout(
      () => setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1"),
      0,
    );
    return () => window.clearTimeout(t);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface/80 backdrop-blur-sm lg:flex",
        "transition-[width] duration-[--dur-slow] ease-[--ease-out]",
        collapsed ? "w-[--sidebar-w-collapsed]" : "w-[--sidebar-w]",
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex h-[--header-h] items-center border-b border-line",
          collapsed ? "justify-center px-2" : "gap-2.5 px-5",
        )}
      >
        <Link href="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[--radius-sm] gradient-primary text-on-accent shadow-[--shadow-primary]">
            <Sparkles className="size-4.5" strokeWidth={1.75} aria-hidden />
          </span>
          {!collapsed ? (
            <span className="min-w-0">
              <span className="display-title block truncate text-lg leading-none text-ink-strong">
                Aurelia
              </span>
              <span className="block truncate text-[0.6875rem] text-subtle">{shopName}</span>
            </span>
          ) : null}
        </Link>
      </div>

      {/* Primary action */}
      <div className={cn("border-b border-line", collapsed ? "p-2" : "p-4")}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" asChild className="w-full">
                <Link href="/sell" aria-label="Scan and sell">
                  <ScanLine aria-hidden />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Scan &amp; sell</TooltipContent>
          </Tooltip>
        ) : (
          <Button block size="lg" asChild>
            <Link href="/sell">
              <ScanLine aria-hidden />
              Scan &amp; sell
            </Link>
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav
        aria-label="Main"
        className={cn("flex-1 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}
      >
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-5 last:mb-0">
            {!collapsed ? (
              <p className="eyebrow mb-2 px-2.5">{section.label}</p>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-line" aria-hidden />
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isNavItemActive(item, pathname);
                const link = (
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center rounded-[--radius-sm] text-sm font-medium",
                      "transition-colors duration-[--dur]",
                      collapsed ? "h-11 justify-center" : "h-11 gap-3 px-2.5",
                      active
                        ? "bg-primary-soft text-primary"
                        : "text-muted hover:bg-surface-sunken hover:text-ink",
                    )}
                  >
                    {active ? (
                      <span
                        className="absolute left-0 h-5 w-[3px] rounded-r-full bg-primary"
                        aria-hidden
                      />
                    ) : null}
                    <item.icon
                      className={cn("size-[1.125rem] shrink-0", active && "text-primary")}
                      strokeWidth={active ? 2 : 1.75}
                      aria-hidden
                    />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  </Link>
                );

                return (
                  <li key={item.href}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">
                          <span className="font-medium">{item.label}</span>
                          {item.description ? (
                            <span className="block opacity-70">{item.description}</span>
                          ) : null}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Owner + collapse */}
      <div className={cn("border-t border-line", collapsed ? "p-2" : "p-3")}>
        <Link
          href="/settings"
          className={cn(
            "flex items-center rounded-[--radius-sm] transition-colors hover:bg-surface-sunken",
            collapsed ? "h-11 justify-center" : "gap-3 p-2",
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-plum-soft text-xs font-semibold text-plum">
            {initials(displayName) || "A"}
          </span>
          {!collapsed ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{displayName}</span>
              <span className="block truncate text-[0.6875rem] text-subtle">Shop settings</span>
            </span>
          ) : null}
        </Link>

        <button
          type="button"
          onClick={toggle}
          className={cn(
            "mt-1 flex h-9 w-full items-center rounded-[--radius-xs] text-xs font-medium text-subtle",
            "transition-colors hover:bg-surface-sunken hover:text-ink",
            collapsed ? "justify-center" : "gap-2 px-2.5",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" aria-hidden />
          ) : (
            <>
              <PanelLeftClose className="size-4" aria-hidden />
              Collapse
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
