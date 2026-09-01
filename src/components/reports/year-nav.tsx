"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Year selector with an "All time" option. Years come from the first recorded
 * year through the current one — never hardcoded.
 */
export function YearNav({
  years,
  selected,
}: {
  years: number[];
  /** A year number, or "all". */
  selected: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function go(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "all") next.delete("year");
    else next.set("year", value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const options: { value: string; label: string }[] = [
    ...years.map((y) => ({ value: String(y), label: String(y) })),
    { value: "all", label: "All time" },
  ];

  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {options.map((opt) => {
        const active = selected === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => go(opt.value)}
            className={cn(
              "shrink-0 rounded-[--radius-pill] border px-4 py-1.5 text-sm font-medium transition-colors",
              active
                ? "border-transparent gradient-primary text-on-accent shadow-sm"
                : "border-line bg-surface text-muted hover:border-line-accent hover:text-ink",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
