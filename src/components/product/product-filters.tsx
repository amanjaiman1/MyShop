"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Product search + filters. Everything lives in the URL so a filtered view is
 * shareable, survives refresh, and lets the dashboard's warning cards deep-link
 * straight to, say, ?flag=loss.
 */
export interface ProductFilterOption {
  id: string;
  name: string;
}

const SORTS = [
  { value: "name", label: "Name (A–Z)" },
  { value: "recent", label: "Recently added" },
  { value: "profit_desc", label: "Best margin" },
  { value: "profit_asc", label: "Worst margin" },
  { value: "stock_asc", label: "Lowest stock" },
  { value: "value_desc", label: "Most inventory value" },
];

const FLAGS = [
  { value: "all", label: "All products" },
  { value: "loss", label: "Priced at a loss" },
  { value: "breakeven", label: "Break-even" },
  { value: "low_margin", label: "Low margin" },
  { value: "low_stock", label: "Low stock" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "expiring", label: "Expiring soon" },
  { value: "archived", label: "Archived" },
];

export function ProductFilters({
  categories,
  total,
}: {
  categories: ProductFilterOption[];
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = React.useState(searchParams.get("q") ?? "");

  const currentView = searchParams.get("view") ?? "grid";
  const currentCategory = searchParams.get("category") ?? "all";
  const currentFlag = searchParams.get("flag") ?? "all";
  const currentSort = searchParams.get("sort") ?? "name";

  const setParam = React.useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "" || value === "all") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Debounce the free-text search so we are not pushing a route on every letter.
  React.useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (query === current) return;
    const timer = setTimeout(() => setParam({ q: query || null }), 300);
    return () => clearTimeout(timer);
  }, [query, searchParams, setParam]);

  const activeFilters =
    (currentCategory !== "all" ? 1 : 0) + (currentFlag !== "all" ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, brand, shade, SKU, barcode or code…"
            className="pl-10"
            aria-label="Search products"
            inputMode="search"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-surface-sunken hover:text-ink"
              aria-label="Clear search"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Select value={currentSort} onValueChange={(v) => setParam({ sort: v })}>
            <SelectTrigger className="w-auto min-w-[9.5rem]" aria-label="Sort products">
              <SlidersHorizontal className="size-4 text-muted" aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ToggleGroup
            type="single"
            value={currentView}
            onValueChange={(v) => v && setParam({ view: v === "grid" ? null : v })}
            className="hidden sm:flex"
          >
            <ToggleGroupItem value="grid" aria-label="Grid view">
              <LayoutGrid className="size-4" aria-hidden />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view">
              <List className="size-4" aria-hidden />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={currentCategory} onValueChange={(v) => setParam({ category: v })}>
          <SelectTrigger size="sm" className="w-auto min-w-[8rem]" aria-label="Filter by category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={currentFlag} onValueChange={(v) => setParam({ flag: v })}>
          <SelectTrigger size="sm" className="w-auto min-w-[8rem]" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {FLAGS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {activeFilters > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setParam({ category: null, flag: null })}
          >
            <X className="size-3.5" aria-hidden />
            Clear
          </Button>
        ) : null}

        <Badge variant="neutral" size="sm" className={cn("ml-auto", activeFilters && "hidden sm:inline-flex")}>
          {total} {total === 1 ? "product" : "products"}
        </Badge>
      </div>
    </div>
  );
}
