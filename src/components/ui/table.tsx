"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Data tables. Financial columns use `tnum` (tabular figures) so digits line up
 * vertically — the difference between a scannable ledger and a wobbling one.
 */

function TableWrapper({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative w-full overflow-x-auto rounded-[--radius-lg] border border-line bg-surface",
        className,
      )}
      {...props}
    />
  );
}

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <table
      data-slot="table"
      className={cn("w-full caption-bottom border-collapse text-sm", className)}
      {...props}
    />
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      className={cn("border-b border-line bg-surface-sunken/70 [&_tr]:border-0", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      className={cn("border-t border-line bg-surface-sunken/70 font-medium", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-line transition-colors last:border-0 hover:bg-surface-muted",
        "data-[state=selected]:bg-primary-soft",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      className={cn(
        "h-11 px-3 text-left align-middle text-[0.6875rem] font-semibold tracking-[0.08em] uppercase text-subtle whitespace-nowrap",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      className={cn("px-3 py-3 align-middle", numeric && "tnum text-right whitespace-nowrap", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption className={cn("mt-3 text-xs text-muted", className)} {...props} />;
}

export type SortDirection = "asc" | "desc";

/** Accessible sortable column header — a real button, keyboard operable. */
function TableSortButton({
  label,
  active,
  direction,
  onToggle,
  numeric = false,
  className,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onToggle: () => void;
  numeric?: boolean;
  className?: string;
}) {
  const Icon = !active ? ChevronsUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[--radius-xs] px-1 py-0.5 -mx-1",
        "text-[0.6875rem] font-semibold tracking-[0.08em] uppercase whitespace-nowrap",
        "transition-colors hover:text-ink",
        active ? "text-primary" : "text-subtle",
        numeric && "flex-row-reverse",
        className,
      )}
    >
      <span>{label}</span>
      <Icon className="size-3" aria-hidden />
    </button>
  );
}

export {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  TableSortButton,
};
