import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  [
    "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap",
    "rounded-[--radius-pill] border font-medium",
    "[&_svg]:pointer-events-none [&_svg]:size-[1.05em]",
  ].join(" "),
  {
    variants: {
      variant: {
        neutral: "border-line bg-surface-sunken text-muted",
        primary: "border-line-accent bg-primary-soft text-primary",
        plum: "border-transparent bg-plum-soft text-plum",
        gold: "border-transparent bg-gold-soft text-gold",
        profit: "border-profit-border bg-profit-soft text-profit",
        lowProfit: "border-lowprofit-border bg-lowprofit-soft text-lowprofit",
        breakeven: "border-breakeven-border bg-breakeven-soft text-breakeven-strong",
        loss: "border-loss-border bg-loss-soft text-loss",
        info: "border-transparent bg-info-soft text-info",
        outline: "border-line-strong bg-transparent text-ink",
        solidPrimary: "border-transparent gradient-primary text-on-accent",
        solidLoss: "border-transparent bg-loss text-on-accent",
      },
      size: {
        sm: "px-2 py-0.5 text-[0.6875rem]",
        default: "px-2.5 py-1 text-xs",
        lg: "px-3 py-1.5 text-sm",
      },
      /** Uppercase + tracked, for status words like PROFIT / LOSS. */
      status: { true: "font-semibold tracking-[0.08em] uppercase", false: "" },
    },
    defaultVariants: { variant: "neutral", size: "default", status: false },
  },
);

function Badge({
  className,
  variant,
  size,
  status,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size, status }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
