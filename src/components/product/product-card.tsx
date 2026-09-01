import Link from "next/link";
import { AlertTriangle, CalendarClock, PackageX } from "lucide-react";
import { Money } from "@/components/common/money";
import { ProductThumb } from "@/components/common/product-thumb";
import { PriceStatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatPercent } from "@/lib/format";
import type { ProductOverviewRow } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

/**
 * Product tile for the grid view. Leads with the image and the price verdict —
 * the two things that decide whether the owner needs to act.
 */
export function ProductCard({ product }: { product: ProductOverviewRow }) {
  return (
    <Link
      href={`/products/${product.id}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-[--radius-lg] border border-line bg-surface shadow-sm",
        "transition-all duration-[--dur] hover:-translate-y-0.5 hover:shadow-md",
        "focus-visible:ring-2 focus-visible:ring-[--primary-ring] focus-visible:ring-offset-2 outline-none",
        !product.is_active && "opacity-70",
      )}
    >
      <div className="relative">
        <ProductThumb src={product.image_url} name={product.name} size="tile" className="rounded-none border-0" />
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {product.stock_status === "out_of_stock" ? (
            <Badge variant="loss" size="sm">
              <PackageX aria-hidden /> Out of stock
            </Badge>
          ) : product.stock_status === "low_stock" ? (
            <Badge variant="lowProfit" size="sm">
              <AlertTriangle aria-hidden /> {product.quantity_on_hand} left
            </Badge>
          ) : null}
          {!product.is_active ? (
            <Badge variant="neutral" size="sm">
              Archived
            </Badge>
          ) : null}
        </div>
        {product.category_name ? (
          <span className="absolute top-2 right-2 rounded-[--radius-pill] bg-surface/85 px-2 py-0.5 text-[0.625rem] font-medium text-ink backdrop-blur-sm">
            {product.category_name}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="min-w-0">
          {product.brand ? (
            <p className="truncate text-[0.6875rem] font-medium tracking-wide text-subtle uppercase">
              {product.brand}
            </p>
          ) : null}
          <h3 className="truncate text-sm font-semibold text-ink-strong">{product.name}</h3>
          {product.shade_or_variant ? (
            <p className="truncate text-xs text-muted">{product.shade_or_variant}</p>
          ) : null}
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div>
            <Money value={product.recommended_selling_price} size="lg" className="block" />
            {product.fifo_unit_cost !== null ? (
              <p className="text-[0.6875rem] text-muted">
                cost <Money value={product.fifo_unit_cost} size="sm" className="text-muted" />
              </p>
            ) : (
              <p className="text-[0.6875rem] text-subtle">no cost yet</p>
            )}
          </div>
          <div className="text-right">
            <PriceStatusBadge status={product.price_status} size="sm" />
            {product.price_status !== "unknown" ? (
              <p className="mt-1 text-[0.6875rem] text-muted">
                {formatPercent(product.expected_margin_pct)} margin
              </p>
            ) : null}
          </div>
        </div>

        {product.nearest_expiry ? (
          <p className="flex items-center gap-1 text-[0.6875rem] text-lowprofit">
            <CalendarClock className="size-3" aria-hidden />
            Expires {product.nearest_expiry}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
