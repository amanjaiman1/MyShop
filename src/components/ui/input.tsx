import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * h-11 keeps the field a comfortable tap target, and text-base on small screens
 * stops iOS/Android from zooming the viewport when a field is focused.
 */
const inputBase = [
  "flex h-11 w-full min-w-0 rounded-[--radius-sm] border border-line-strong bg-surface",
  "px-3.5 py-2 text-base sm:text-sm text-ink shadow-xs",
  "placeholder:text-subtle",
  "transition-[border-color,box-shadow] duration-[--dur] ease-[--ease-out]",
  "outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-[--primary-ring]",
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted",
  "aria-invalid:border-loss aria-invalid:ring-2 aria-invalid:ring-[--loss-border]",
  "file:mr-3 file:h-7 file:rounded-[--radius-xs] file:border-0 file:bg-primary-soft file:px-3 file:text-xs file:font-medium file:text-primary",
].join(" ");

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input data-slot="input" type={type} className={cn(inputBase, className)} {...props} />
  );
}

export interface MoneyInputProps extends Omit<React.ComponentProps<"input">, "type"> {
  currencySymbol: string;
  /** Renders the field large enough to be the focal point of a form. */
  emphasis?: boolean;
}

/**
 * Money field. Deliberately `inputMode="decimal"` with `type="text"` so the
 * phone keypad shows a decimal point, without the browser's number-spinner or
 * its locale-dependent parsing. The typed text is converted to integer minor
 * units by the Zod schema.
 */
function MoneyInput({
  className,
  currencySymbol,
  emphasis = false,
  ...props
}: MoneyInputProps) {
  return (
    <div className="relative">
      <span
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 font-medium text-muted",
          emphasis ? "text-lg" : "text-sm",
        )}
        aria-hidden
      >
        {currencySymbol}
      </span>
      <input
        data-slot="money-input"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn(
          inputBase,
          "tnum pl-9 font-medium",
          emphasis && "h-14 pl-10 text-2xl font-semibold tracking-[-0.02em]",
          className,
        )}
        {...props}
      />
    </div>
  );
}

/** Whole-unit quantity field with the same keyboard treatment. */
function QuantityInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      data-slot="quantity-input"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      className={cn(inputBase, "tnum text-center font-medium", className)}
      {...props}
    />
  );
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        inputBase,
        "field-sizing-content min-h-20 resize-y py-2.5 leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Input, MoneyInput, QuantityInput, Textarea, inputBase };
