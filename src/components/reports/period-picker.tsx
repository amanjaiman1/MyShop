"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/misc";
import { Label } from "@/components/ui/label";
import { PERIOD_OPTIONS } from "@/lib/constants";
import type { ReportPeriodKey } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

/**
 * Quick date-range selector used by every financial screen. The chosen period
 * lives in the URL (?period, ?start, ?end) so a view is shareable and the
 * server resolves the exact dates using the shop's timezone.
 */
export function PeriodPicker({ today }: { today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const period = (searchParams.get("period") ?? "this_month") as ReportPeriodKey;
  const start = searchParams.get("start") ?? "";
  const end = searchParams.get("end") ?? "";

  const [customOpen, setCustomOpen] = React.useState(false);
  const [draftStart, setDraftStart] = React.useState(start || today);
  const [draftEnd, setDraftEnd] = React.useState(end || today);

  function select(key: ReportPeriodKey) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("period", key);
    if (key !== "custom") {
      next.delete("start");
      next.delete("end");
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function applyCustom() {
    const next = new URLSearchParams(searchParams.toString());
    next.set("period", "custom");
    next.set("start", draftStart);
    next.set("end", draftEnd);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    setCustomOpen(false);
  }

  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {PERIOD_OPTIONS.filter((p) => p.value !== "custom").map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => select(option.value)}
          className={cn(
            "shrink-0 rounded-[--radius-pill] border px-3.5 py-1.5 text-sm font-medium transition-colors",
            period === option.value
              ? "border-transparent gradient-primary text-on-accent shadow-sm"
              : "border-line bg-surface text-muted hover:border-line-accent hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}

      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-[--radius-pill] border px-3.5 py-1.5 text-sm font-medium transition-colors",
              period === "custom"
                ? "border-transparent gradient-primary text-on-accent shadow-sm"
                : "border-line bg-surface text-muted hover:border-line-accent hover:text-ink",
            )}
          >
            <CalendarRange className="size-4" aria-hidden />
            {period === "custom" && start ? `${start} – ${end}` : "Custom"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink">Custom date range</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="range-start" className="text-xs">
                  From
                </Label>
                <Input
                  id="range-start"
                  type="date"
                  value={draftStart}
                  max={today}
                  onChange={(e) => setDraftStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="range-end" className="text-xs">
                  To
                </Label>
                <Input
                  id="range-end"
                  type="date"
                  value={draftEnd}
                  max={today}
                  onChange={(e) => setDraftEnd(e.target.value)}
                />
              </div>
            </div>
            <Button size="sm" block onClick={applyCustom} disabled={draftStart > draftEnd}>
              Apply range
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
