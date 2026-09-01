import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Boxes,
  CalendarClock,
  Coins,
  History,
  Layers,
  PackageCheck,
  ShoppingCart,
  Tag,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Money, Figure } from "@/components/common/money";
import { ProductThumb } from "@/components/common/product-thumb";
import { PriceStatusBadge, StockStatusBadge } from "@/components/common/status-badge";
import { StatCard } from "@/components/common/stat-card";
import { SavePriceCard } from "@/components/product/save-price-card";
import { StockAdjustDialog } from "@/components/product/stock-adjust-dialog";
import { ProductActions } from "@/components/product/product-actions";
import { LabelSheet } from "@/components/scan/label-sheet";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getShopContext } from "@/lib/supabase/queries";
import { analyseBatches } from "@/lib/pricing";
import { formatDate, formatDateTime, formatPercent } from "@/lib/format";
import { MOVEMENT_TYPE_LABELS } from "@/lib/constants";
import type {
  ProductOverviewRow,
  ProductPriceHistoryRow,
  PurchaseBatchRow,
  StockMovementRow,
} from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("product_overview")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  return { title: (data as { name?: string } | null)?.name ?? "Product" };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [shop, profile] = await Promise.all([getShopContext(), getProfile()]);

  const { data: productRaw } = await supabase
    .from("product_overview")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!productRaw) notFound();
  const product = productRaw as ProductOverviewRow;

  const [{ data: batchesRaw }, { data: historyRaw }, { data: movementsRaw }] = await Promise.all([
    supabase
      .from("purchase_batches")
      .select("*")
      .eq("product_id", id)
      .order("purchase_date", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("product_price_history")
      .select("*")
      .eq("product_id", id)
      .order("changed_at", { ascending: false })
      .limit(12),
    supabase
      .from("stock_movements")
      .select("*")
      .eq("product_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const batches = (batchesRaw ?? []) as PurchaseBatchRow[];
  const openBatches = batches.filter((b) => b.quantity_remaining > 0);
  const history = (historyRaw ?? []) as ProductPriceHistoryRow[];
  const movements = (movementsRaw ?? []) as StockMovementRow[];

  const batchProfitability = analyseBatches(
    openBatches,
    product.recommended_selling_price,
    Number(profile.low_margin_threshold),
  );

  const subtitle = [product.brand, product.shade_or_variant, product.size]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Product"
        title={product.name}
        backHref="/products"
        backLabel="Products"
        actions={<ProductActions productId={product.id} isActive={product.is_active} />}
      />

      {/* Hero */}
      <Card>
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
          <ProductThumb
            src={product.image_url}
            name={product.name}
            size="hero"
            className="w-full sm:w-52"
            priority
          />
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {product.category_name ? (
                    <Badge variant="plum" size="sm">
                      {product.category_name}
                    </Badge>
                  ) : null}
                  <StockStatusBadge
                    status={product.stock_status}
                    quantity={product.quantity_on_hand}
                  />
                  <PriceStatusBadge status={product.price_status} size="sm" />
                  {!product.is_active ? <Badge variant="neutral" size="sm">Archived</Badge> : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <LabelSheet
                  code={product.internal_code}
                  name={product.name}
                  price={product.recommended_selling_price}
                />
                <StockAdjustDialog productId={product.id} quantityOnHand={product.quantity_on_hand} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-3">
              <Figure label="Internal code">
                <span className="font-mono text-sm">{product.internal_code}</span>
              </Figure>
              {product.manufacturer_barcode ? (
                <Figure label="Barcode">
                  <span className="font-mono text-sm">{product.manufacturer_barcode}</span>
                </Figure>
              ) : null}
              {product.sku ? (
                <Figure label="SKU">
                  <span className="font-mono text-sm">{product.sku}</span>
                </Figure>
              ) : null}
              <Figure label="Recommended price">
                <Money value={product.recommended_selling_price} size="lg" />
              </Figure>
              <Figure label="Minimum price">
                <Money value={product.minimum_selling_price} />
              </Figure>
              <Figure label="Expected profit / unit">
                <Money value={product.expected_unit_profit} tone showSign />
              </Figure>
            </div>

            {product.description ? (
              <p className="text-sm leading-relaxed text-muted">{product.description}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Inventory position */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="On hand"
          value={product.quantity_on_hand.toLocaleString("en-IN")}
          icon={Boxes}
          tone={product.stock_status === "out_of_stock" ? "loss" : product.stock_status === "low_stock" ? "lowProfit" : "default"}
          hint={`Low-stock alert at ${product.low_stock_threshold}`}
        />
        <StatCard
          label="Inventory investment"
          value={<Money value={product.inventory_cost} size="xl" />}
          icon={Coins}
          tone="gold"
          hint={`${product.open_batch_count} open batch${product.open_batch_count === 1 ? "" : "es"}`}
        />
        <StatCard
          label="FIFO cost (next sold)"
          value={<Money value={product.fifo_unit_cost} size="xl" />}
          icon={Layers}
          tone="primary"
          hint={
            product.latest_unit_cost !== null ? (
              <>
                latest <Money value={product.latest_unit_cost} size="sm" className="text-muted" />
              </>
            ) : undefined
          }
        />
        <StatCard
          label="Projected profit"
          value={<Money value={product.projected_gross_profit} size="xl" tone />}
          icon={TrendingUp}
          tone={product.projected_gross_profit >= 0 ? "profit" : "loss"}
          hint={`at recommended · ${formatPercent(product.expected_margin_pct)} margin`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Price simulator */}
        <div className="lg:col-span-3">
          <SavePriceCard product={product} />
        </div>

        {/* Batch profitability */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Purchase batches</CardTitle>
          </CardHeader>
          <CardContent>
            {openBatches.length === 0 ? (
              <EmptyState
                compact
                icon={PackageCheck}
                title="No open stock"
                description="Record a purchase to add cost layers for this product."
                action={
                  <Button asChild size="sm">
                    <Link href="/purchases/new">
                      <ShoppingCart aria-hidden />
                      Record purchase
                    </Link>
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-2.5">
                {batchProfitability.map((batch) => (
                  <li
                    key={batch.batchId}
                    className="flex items-center justify-between gap-3 rounded-[--radius-md] border border-line bg-surface-muted p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Money value={batch.unitCost} size="default" className="font-semibold" />
                        <span className="text-xs text-muted">
                          × {batch.quantityRemaining} left
                        </span>
                      </div>
                      <p className="text-[0.6875rem] text-subtle">
                        Bought {formatDate(batch.purchaseDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <PriceStatusBadge status={batch.status} size="sm" />
                      <p className="mt-1 text-[0.6875rem] text-muted">
                        {formatPercent(batch.marginPct)} margin
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {product.has_batch_below_price ? (
              <p className="mt-3 rounded-[--radius-sm] border border-lowprofit-border bg-lowprofit-soft px-3 py-2 text-xs text-lowprofit">
                Your recommended price is below the cost of at least one batch above — those units
                would sell at a loss.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Price history + movements */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="size-4 text-muted" aria-hidden />
              Price history
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length <= 1 ? (
              <p className="py-4 text-center text-sm text-muted">
                No price changes recorded yet.
              </p>
            ) : (
              <ol className="relative space-y-4 border-l border-line pl-5">
                {history.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span className="absolute top-1 -left-[1.4rem] size-2.5 rounded-full border-2 border-surface bg-primary" />
                    <div className="flex items-center justify-between gap-2">
                      <Money
                        value={entry.new_selling_price}
                        size="default"
                        className="font-semibold"
                      />
                      {entry.previous_selling_price !== null ? (
                        <span className="text-xs text-muted">
                          from <Money value={entry.previous_selling_price} size="sm" className="text-muted" />
                        </span>
                      ) : (
                        <Badge variant="neutral" size="sm">
                          Initial
                        </Badge>
                      )}
                    </div>
                    <p className="text-[0.6875rem] text-subtle">
                      {formatDateTime(entry.changed_at, shop.timezone)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="size-4 text-muted" aria-hidden />
              Recent stock movements
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {movements.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">No movements yet.</p>
            ) : (
              <TableWrapper className="rounded-none border-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead numeric>Qty</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <span className="text-sm">{MOVEMENT_TYPE_LABELS[m.movement_type]}</span>
                          {m.notes ? (
                            <p className="text-[0.6875rem] text-subtle line-clamp-1">{m.notes}</p>
                          ) : null}
                        </TableCell>
                        <TableCell numeric>
                          <span className={m.quantity > 0 ? "text-profit" : "text-loss"}>
                            {m.quantity > 0 ? "+" : ""}
                            {m.quantity}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted">
                            {formatDate(m.created_at.slice(0, 10))}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrapper>
            )}
            <div className="p-3">
              <Button asChild variant="ghost" size="sm" block>
                <Link href={`/movements?product=${product.id}`}>
                  <CalendarClock aria-hidden />
                  View all movements
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
