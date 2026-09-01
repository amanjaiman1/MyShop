import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva(
  "relative rounded-[--radius-lg] border transition-shadow duration-[--dur] ease-[--ease-out]",
  {
    variants: {
      tone: {
        default: "bg-surface border-line shadow-sm",
        raised: "bg-surface-raised border-line shadow-md",
        sunken: "bg-surface-sunken border-line shadow-none",
        /** Editorial hero panel — used sparingly, once per screen at most. */
        feature:
          "gradient-primary border-transparent text-on-accent shadow-[--shadow-primary]",
        champagne: "gradient-champagne border-[--gold-soft] shadow-sm",
        profit: "bg-profit-soft border-profit-border shadow-none",
        lowProfit: "bg-lowprofit-soft border-lowprofit-border shadow-none",
        breakeven: "bg-breakeven-soft border-breakeven-border shadow-none",
        loss: "bg-loss-soft border-loss-border shadow-none",
      },
      interactive: {
        true: "hover:shadow-md hover:-translate-y-px transition-transform cursor-pointer",
        false: "",
      },
    },
    defaultVariants: { tone: "default", interactive: false },
  },
);

function Card({
  className,
  tone,
  interactive,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ tone, interactive }), className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1 p-5 pb-3 sm:p-6 sm:pb-4", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn("text-base leading-tight font-semibold tracking-[-0.01em]", className)}
      {...props}
    />
  );
}

/** Editorial variant for hero/section titles. */
function CardTitleDisplay({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn("display-title text-xl sm:text-2xl", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-sm leading-relaxed text-muted", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("absolute top-4 right-4 sm:top-5 sm:right-5", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("p-5 pt-0 sm:p-6 sm:pt-0", className)} {...props} />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center gap-3 p-5 pt-0 sm:p-6 sm:pt-0", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardTitle,
  CardTitleDisplay,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
  cardVariants,
};
