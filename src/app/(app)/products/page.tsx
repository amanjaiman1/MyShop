import type { Metadata } from "next";
import Link from "next/link";
import { Package, Plus, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ProductCard } from "@/components/product/product-card";
import { ProductListRow } from "@/components/product/product-list-row";
import { ProductFilters } from "@/components/product/product-filters";
import { createClient } from "@/lib/supabase/server";
import { getShopContext } from "@/lib/supabase/queries";
import { addDays } from "@/lib/format";
import { EXPIRY_ALERT_DAYS } from "@/lib/constants";
import type { CategoryRow, ProductOverviewRow } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Products" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const shop = await getShopContext();

  const q = sp.q?.trim() ?? "";
  const category = sp.category ?? "all";
  const flag = sp.flag ?? "all";
  const sort = sp.sort ?? "name";
  const view = sp.view === "list" ? "list" : "grid";

  let query = supabase.from("product_overview").select("*");

  // Archived products only appear when explicitly requested.
  if (flag !== "archived") query = query.eq("is_active", true);
  else query = query.eq("is_active", false);

  if (category !== "all") query = query.eq("category_id", category);

  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(
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

  const { data } = await query.limit(500);
  let products = (data ?? []) as ProductOverviewRow[];

  // Flag filters that depend on derived/date fields, applied in-memory.
  const expiryHorizon = addDays(shop.today, EXPIRY_ALERT_DAYS);
  products = products.filter((p) => {
    switch (flag) {
      case "loss":
        return p.price_status === "loss";
      case "breakeven":
        return p.price_status === "breakeven";
      case "low_margin":
        return p.price_status === "low_profit";
      case "low_stock":
        return p.stock_status === "low_stock";
      case "out_of_stock":
        return p.stock_status === "out_of_stock";
      case "expiring":
        return p.nearest_expiry !== null && p.nearest_expiry <= expiryHorizon;
      default:
        return true;
    }
  });

  products.sort((a, b) => {
    switch (sort) {
      case "recent":
        return b.created_at.localeCompare(a.created_at);
      case "profit_desc":
        return b.expected_margin_pct - a.expected_margin_pct;
      case "profit_asc":
        return a.expected_margin_pct - b.expected_margin_pct;
      case "stock_asc":
        return a.quantity_on_hand - b.quantity_on_hand;
      case "value_desc":
        return b.inventory_cost - a.inventory_cost;
      default:
        return a.name.localeCompare(b.name);
    }
  });

  const { data: categoriesRaw } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");
  const categories = (categoriesRaw ?? []) as Pick<CategoryRow, "id" | "name">[];

  const isFiltered = q !== "" || category !== "all" || flag !== "all";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        description="Every variant you stock, with its live margin and inventory position."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/sell">
                <ScanLine aria-hidden />
                Scan
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/products/new">
                <Plus aria-hidden />
                New product
              </Link>
            </Button>
          </>
        }
      />

      <ProductFilters categories={categories} total={products.length} />

      {products.length === 0 ? (
        isFiltered ? (
          <EmptyState
            icon={Package}
            title="Nothing matches those filters"
            description="Try a different search term, or clear the filters to see your whole catalogue."
            action={
              <Button asChild variant="outline">
                <Link href="/products">Clear filters</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Package}
            eyebrow="Let's begin"
            title="Add your first product"
            description="Create a product for each shade or size you resell. Then record a purchase to set its cost and start tracking profit."
            action={
              <Button asChild>
                <Link href="/products/new">
                  <Plus aria-hidden />
                  New product
                </Link>
              </Button>
            }
          />
        )
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[--radius-lg] border border-line bg-surface shadow-sm">
          {products.map((product) => (
            <ProductListRow key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
