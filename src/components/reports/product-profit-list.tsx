import Link from "next/link";
import { ProductThumb } from "@/components/common/product-thumb";
import { Money } from "@/components/common/money";
import { formatPercent } from "@/lib/format";
import type { ProductProfitabilityRow } from "@/lib/supabase/database.types";

/** Compact ranked list of products by realized profit (most / least / loss). */
export function ProductProfitList({
  products,
  emptyLabel = "No products sold in this period.",
}: {
  products: ProductProfitabilityRow[];
  emptyLabel?: string;
}) {
  if (products.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2">
      {products.map((p) => (
        <li key={p.product_id}>
          <Link
            href={`/products/${p.product_id}`}
            className="flex items-center gap-3 rounded-[--radius-md] p-2 transition-colors hover:bg-surface-muted"
          >
            <ProductThumb src={p.image_url} name={p.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-strong">{p.name}</p>
              <p className="truncate text-xs text-muted">
                {p.units_sold} sold · {formatPercent(p.margin_pct)} margin
              </p>
            </div>
            <div className="text-right">
              <Money value={p.net_profit} size="default" tone showSign className="block font-semibold" />
              <Money value={p.net_revenue} size="sm" className="block text-muted" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
