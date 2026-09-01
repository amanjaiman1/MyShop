import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Money } from "@/components/common/money";
import { ProductThumb } from "@/components/common/product-thumb";
import { PriceStatusBadge, StockStatusBadge } from "@/components/common/status-badge";
import { formatPercent } from "@/lib/format";
import type { ProductOverviewRow } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

/** Dense list row — the scannable ledger view of the catalogue. */
export function ProductListRow({ product }: { product: ProductOverviewRow }) {
  return (
    <Link
      href={`/products/${product.id}`}
      className={cn(
        "flex items-center gap-3 border-b border-line px-3 py-3 last:border-0",
        "transition-colors hover:bg-surface-muted",
        !product.is_active && "opacity-70",
      )}
    >
      <ProductThumb src={product.image_url} name={product.name} size="sm" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-ink-strong">{product.name}</h3>
          {!product.is_active ? (
            <span className="shrink-0 text-[0.625rem] text-subtle">(archived)</span>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted">
          {[product.brand, product.shade_or_variant, product.size].filter(Boolean).join(" · ") ||
            product.internal_code}
        </p>
        <p className="mt-0.5 font-mono text-[0.625rem] text-subtle">{product.internal_code}</p>
      </div>

      {/* Stock */}
      <div className="hidden w-24 shrink-0 text-center sm:block">
        <StockStatusBadge
          status={product.stock_status}
          quantity={product.quantity_on_hand}
          size="sm"
        />
      </div>

      {/* Cost */}
      <div className="hidden w-24 shrink-0 text-right md:block">
        <Money value={product.fifo_unit_cost} size="sm" className="block text-muted" />
        <p className="text-[0.625rem] text-subtle">cost</p>
      </div>

      {/* Price + status */}
      <div className="w-28 shrink-0 text-right">
        <Money value={product.recommended_selling_price} size="default" className="block font-semibold" />
        <div className="mt-1 flex items-center justify-end gap-1.5">
          <PriceStatusBadge status={product.price_status} size="sm" />
        </div>
        {product.price_status !== "unknown" ? (
          <p className="mt-0.5 hidden text-[0.625rem] text-muted lg:block">
            {formatPercent(product.expected_margin_pct)}
          </p>
        ) : null}
      </div>

      <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
    </Link>
  );
}
