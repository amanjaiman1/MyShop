"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Month + year navigator. Available years are derived from the earliest
 * business record (passed in), never hardcoded, and future months in the
 * current year are disabled.
 */
export function MonthNav({
  selectedMonth,
  earliestYear,
  latestYear,
  latestMonthIndex,
}: {
  /** "YYYY-MM" */
  selectedMonth: string;
  earliestYear: number;
  latestYear: number;
  /** 0-based month index of the latest available month in latestYear. */
  latestMonthIndex: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [yearStr, monthStr] = selectedMonth.split("-");
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1;

  const years = Array.from({ length: latestYear - earliestYear + 1 }, (_, i) => earliestYear + i);

  function go(nextYear: number, nextMonthIdx: number) {
    // Clamp to the available window.
    if (nextYear > latestYear || (nextYear === latestYear && nextMonthIdx > latestMonthIndex)) return;
    if (nextYear < earliestYear) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("month", `${nextYear}-${String(nextMonthIdx + 1).padStart(2, "0")}`);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const isFutureMonth = (m: number) => year === latestYear && m > latestMonthIndex;
  const atStart = year === earliestYear && monthIdx === 0;
  const atEnd = year === latestYear && monthIdx === latestMonthIndex;

  function step(delta: number) {
    let y = year;
    let m = monthIdx + delta;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    go(y, m);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => step(-1)} disabled={atStart} aria-label="Previous month">
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <Select value={String(year)} onValueChange={(v) => go(Number(v), monthIdx)}>
          <SelectTrigger className="w-auto min-w-[6rem]" aria-label="Year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => step(1)} disabled={atEnd} aria-label="Next month">
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {MONTHS.map((label, m) => {
          const disabled = isFutureMonth(m);
          const active = m === monthIdx;
          return (
            <button
              key={label}
              type="button"
              disabled={disabled}
              onClick={() => go(year, m)}
              className={cn(
                "shrink-0 rounded-[--radius-pill] border px-3.5 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "border-transparent gradient-primary text-on-accent shadow-sm"
                  : disabled
                    ? "cursor-not-allowed border-line bg-surface text-subtle opacity-50"
                    : "border-line bg-surface text-muted hover:border-line-accent hover:text-ink",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
