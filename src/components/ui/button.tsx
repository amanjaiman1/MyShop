import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Default size is h-11 (44px) — the minimum comfortable touch target on a
 * phone. Desktop density is achieved with `size="sm"`, never by shrinking the
 * primary actions the owner taps all day.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium",
    "rounded-[--radius-sm] outline-none select-none",
    "transition-[background-color,box-shadow,transform,border-color,color]",
    "duration-[--dur] ease-[--ease-out]",
    "active:scale-[0.985]",
    "disabled:pointer-events-none disabled:opacity-45",
    "focus-visible:ring-2 focus-visible:ring-[--primary-ring] focus-visible:ring-offset-2 focus-visible:ring-offset-[--surface]",
    "[&_svg]:shrink-0 [&_svg]:size-[1.05em]",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "gradient-primary text-on-accent shadow-[--shadow-primary] hover:brightness-[1.06] hover:shadow-lg",
        secondary:
          "bg-primary-soft text-primary border border-line-accent hover:bg-primary-soft-hover",
        outline:
          "border border-line-strong bg-surface text-ink shadow-xs hover:bg-surface-muted hover:border-line-accent",
        ghost: "text-ink hover:bg-surface-sunken",
        subtle: "bg-surface-sunken text-ink hover:bg-canvas-alt",
        gold: "bg-gold text-on-accent shadow-sm hover:bg-gold-hover",
        destructive: "bg-loss text-on-accent shadow-sm hover:bg-loss-strong",
        destructiveOutline:
          "border border-loss-border bg-loss-soft text-loss hover:bg-loss-soft hover:border-loss",
        link: "text-primary underline-offset-4 hover:underline px-0",
      },
      size: {
        sm: "h-9 px-3 text-[0.8125rem] rounded-[--radius-xs]",
        default: "h-11 px-4 text-sm",
        lg: "h-12 px-6 text-[0.9375rem]",
        xl: "h-14 px-8 text-base rounded-[--radius-md]",
        icon: "size-11",
        iconSm: "size-9 rounded-[--radius-xs]",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "default", block: false },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner and blocks interaction. Width does not jump. */
  loading?: boolean;
  loadingText?: string;
}

function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  loading = false,
  loadingText,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          <span>{loadingText ?? children}</span>
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
