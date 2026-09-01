"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MOVEMENT_TYPE_LABELS } from "@/lib/constants";
import type { StockMovementType } from "@/lib/supabase/database.types";

/** Filter the movement ledger by type, synced to the URL. */
export function MovementsFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const type = searchParams.get("type") ?? "all";

  function setType(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "all") next.delete("type");
    else next.set("type", value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <Select value={type} onValueChange={setType}>
      <SelectTrigger size="sm" className="w-auto min-w-[10rem]" aria-label="Filter by movement type">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All movement types</SelectItem>
        {(Object.keys(MOVEMENT_TYPE_LABELS) as StockMovementType[]).map((t) => (
          <SelectItem key={t} value={t}>
            {MOVEMENT_TYPE_LABELS[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
