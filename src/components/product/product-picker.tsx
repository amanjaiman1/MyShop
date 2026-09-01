"use client";

import * as React from "react";
import { Loader2, PackageSearch, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScannerButton } from "@/components/scan/scanner-button";
import { ProductThumb } from "@/components/common/product-thumb";
import { Money } from "@/components/common/money";
import { StockStatusBadge } from "@/components/common/status-badge";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { ProductOverviewRow } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

/**
 * Reusable product search + scan surface.
 *
 * Powers both "Record purchase" and the till. A scan is resolved by exact
 * barcode or internal code first (so scanning always lands on one product); a
 * typed query does a broad trigram-backed search. `requireStock` hides
 * out-of-stock items for selling.
 */
export function ProductPicker({
  onSelect,
  requireStock = false,
  excludeIds = [],
  autoFocus = false,
  placeholder = "Search or scan a product…",
}: {
  onSelect: (product: ProductOverviewRow) => void;
  requireStock?: boolean;
  excludeIds?: string[];
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<ProductOverviewRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const reqId = React.useRef(0);

  const runSearch = React.useCallback(
    async (term: string) => {
      const id = ++reqId.current;
      setLoading(true);
      try {
        const supabase = createClient();
        let q = supabase
          .from("product_overview")
          .select("*")
          .eq("is_active", true)
          .order("name")
          .limit(24);

        const safe = term.trim().replace(/[%,()]/g, " ");
        if (safe) {
          q = q.or(
            [
              `name.ilike.%${safe}%`,
              `brand.ilike.%${safe}%`,
              `shade_or_variant.ilike.%${safe}%`,
              `sku.ilike.%${safe}%`,
              `internal_code.ilike.%${safe}%`,
              `manufacturer_barcode.ilike.%${safe}%`,
            ].join(","),
          );
        }

        const { data } = await q;
        if (id !== reqId.current) return; // a newer search superseded this one
        let rows = (data ?? []) as ProductOverviewRow[];
        if (requireStock) rows = rows.filter((r) => r.quantity_on_hand > 0);
        if (excludeIds.length) rows = rows.filter((r) => !excludeIds.includes(r.id));
        setResults(rows);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [excludeIds, requireStock],
  );

  React.useEffect(() => {
    const timer = setTimeout(() => void runSearch(query), 220);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  /** Resolve a scanned code to exactly one product, or report why not. */
  async function resolveScan(code: string) {
    const trimmed = code.trim();
    const supabase = createClient();
    const { data } = await supabase
      .from("product_overview")
      .select("*")
      .or(`manufacturer_barcode.eq.${trimmed},internal_code.eq.${trimmed.toUpperCase()},sku.eq.${trimmed}`)
      .limit(2);

    const rows = (data ?? []) as ProductOverviewRow[];
    if (rows.length === 0) {
      toast.error(`No product matches “${trimmed}”.`);
      setQuery(trimmed);
      return;
    }
    if (rows.length > 1) {
      toast.info("More than one product uses that code — pick one below.");
      setResults(rows);
      return;
    }
    const product = rows[0]!;
    if (requireStock && product.quantity_on_hand <= 0) {
      toast.error(`${product.name} is out of stock.`);
      return;
    }
    onSelect(product);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="pl-10"
            inputMode="search"
            autoFocus={autoFocus}
            aria-label="Search products"
          />
          {loading ? (
            <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted" aria-hidden />
          ) : null}
        </div>
        <ScannerButton
          onScan={resolveScan}
          title="Scan a product"
          description="Point the rear camera at the barcode or Aurelia label."
        />
      </div>

      <div className="max-h-80 space-y-1.5 overflow-y-auto">
        {results.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted">
            <PackageSearch className="size-6 text-subtle" aria-hidden />
            {query ? "No matching products." : "Start typing, or scan a code."}
          </div>
        ) : (
          results.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => onSelect(product)}
              className={cn(
                "flex w-full items-center gap-3 rounded-[--radius-md] border border-line bg-surface p-2.5 text-left",
                "transition-colors hover:border-line-accent hover:bg-surface-muted",
                "focus-visible:ring-2 focus-visible:ring-[--primary-ring] outline-none",
              )}
            >
              <ProductThumb src={product.image_url} name={product.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-strong">{product.name}</p>
                <p className="truncate text-xs text-muted">
                  {[product.brand, product.shade_or_variant].filter(Boolean).join(" · ") ||
                    product.internal_code}
                </p>
                <div className="mt-1">
                  <StockStatusBadge status={product.stock_status} quantity={product.quantity_on_hand} size="sm" />
                </div>
              </div>
              <div className="text-right">
                <Money value={product.recommended_selling_price} size="default" className="block font-semibold" />
                {product.fifo_unit_cost !== null ? (
                  <p className="text-[0.6875rem] text-muted">
                    cost <Money value={product.fifo_unit_cost} size="sm" className="text-muted" />
                  </p>
                ) : null}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
