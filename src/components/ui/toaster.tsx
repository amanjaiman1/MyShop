"use client";

import { Toaster as Sonner } from "sonner";

/**
 * Toasts sit above the mobile bottom navigation so a confirmation is never
 * hidden behind the Scan/Sell button.
 */
export function Toaster() {
  return (
    <Sonner
      position="top-center"
      offset={16}
      mobileOffset={{ top: "12px" }}
      duration={4200}
      gap={10}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-[--radius-md] !border !border-line !bg-surface-raised !text-ink !shadow-lg !font-sans !text-sm !gap-3",
          title: "!font-medium",
          description: "!text-muted !text-xs !leading-relaxed",
          actionButton:
            "!rounded-[--radius-xs] !bg-primary !text-on-accent !text-xs !font-medium !px-2.5 !h-8",
          cancelButton:
            "!rounded-[--radius-xs] !bg-surface-sunken !text-ink !text-xs !font-medium !px-2.5 !h-8",
          success: "!border-profit-border [&_[data-icon]]:!text-profit",
          error: "!border-loss-border [&_[data-icon]]:!text-loss",
          warning: "!border-lowprofit-border [&_[data-icon]]:!text-lowprofit",
          info: "!border-line-accent [&_[data-icon]]:!text-primary",
        },
      }}
    />
  );
}
