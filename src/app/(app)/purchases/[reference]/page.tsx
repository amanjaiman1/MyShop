import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Coins, Layers, Package, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { Money, Figure } from "@/components/common/money";
import { StatCard } from "@/components/common/stat-card";
import { ProductThumb } from "@/components/common/product-thumb";
import { LabelSheet } from "@/components/scan/label-sheet";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Purchase detail" };
export const dynamic = "force-dynamic";

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference: rawRef } = await params;
  const reference = decodeURIComponent(rawRef);
  const supabase = await createClient();

  const { data } = await supabase
    .from("purchase_batches")
    .select(
      "id, reference_number, purchase_date, quantity_purchased, quantity_remaining, unit_cost, lot_number, expiry_date, notes, product_id, supplier_id, products(name, brand, shade_or_variant, image_url, internal_code, recommended_selling_price), suppliers(name, phone, email)",
    )
    .eq("reference_number", reference)
    .order("created_at", { ascending: true });

  type Row = {
    id: string;
    purchase_date: string;
    quantity_purchased: number;
    quantity_remaining: number;
    unit_cost: number;
    lot_number: string | null;
    expiry_date: string | null;
    product_id: string;
    products: {
      name: string;
      brand: string | null;
      shade_or_variant: string | null;
      image_url: string | null;
      internal_code: string;
      recommended_selling_price: number;
    } | null;
    suppliers: { name: string; phone: string | null; email: string | null } | null;
  };

  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) notFound();

  const first = rows[0]!;
  const supplier = first.suppliers;
  const totalUnits = rows.reduce((a, r) => a + r.quantity_purchased, 0);
  const totalInvestment = rows.reduce((a, r) => a + r.quantity_purchased * r.unit_cost, 0);
  const remainingUnits = rows.reduce((a, r) => a + r.quantity_remaining, 0);
  const remainingValue = rows.reduce((a, r) => a + r.quantity_remaining * r.unit_cost, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Purchase"
        title={reference}
        description={`Recorded on ${formatDate(first.purchase_date)}${supplier ? ` · ${supplier.name}` : ""}`}
        backHref="/purchases"
        backLabel="Purchases"
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Total invested"
          value={<Money value={totalInvestment} size="xl" />}
          icon={Coins}
          tone="gold"
        />
        <StatCard label="Units bought" value={totalUnits.toLocaleString("en-IN")} icon={Package} tone="primary" />
        <StatCard
          label="Still in stock"
          value={remainingUnits.toLocaleString("en-IN")}
          icon={Layers}
          tone="default"
          hint={`from this purchase`}
        />
        <StatCard
          label="Remaining value"
          value={<Money value={remainingValue} size="xl" />}
          icon={Truck}
          tone="default"
        />
      </div>

      {supplier ? (
        <Card>
          <CardHeader>
            <CardTitle>Supplier</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-x-8 gap-y-3">
            <Figure label="Name">{supplier.name}</Figure>
            {supplier.phone ? <Figure label="Phone">{supplier.phone}</Figure> : null}
            {supplier.email ? <Figure label="Email">{supplier.email}</Figure> : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Items in this purchase</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((row) => {
            const product = row.products;
            return (
              <div
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-[--radius-lg] border border-line bg-surface p-3"
              >
                <ProductThumb
                  src={product?.image_url ?? null}
                  name={product?.name ?? "Product"}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/products/${row.product_id}`}
                    className="truncate text-sm font-semibold text-ink-strong hover:text-primary"
                  >
                    {product?.name ?? "Product"}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    {[product?.brand, product?.shade_or_variant].filter(Boolean).join(" · ") ||
                      product?.internal_code}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {row.lot_number ? (
                      <Badge variant="neutral" size="sm">
                        Lot {row.lot_number}
                      </Badge>
                    ) : null}
                    {row.expiry_date ? (
                      <Badge variant="lowProfit" size="sm">
                        Expires {formatDate(row.expiry_date)}
                      </Badge>
                    ) : null}
                    <Badge variant="neutral" size="sm">
                      {row.quantity_remaining}/{row.quantity_purchased} left
                    </Badge>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">
                    {row.quantity_purchased} × <Money value={row.unit_cost} size="sm" className="text-muted" />
                  </p>
                  <Money
                    value={row.quantity_purchased * row.unit_cost}
                    size="default"
                    className="font-semibold"
                  />
                </div>
                {product ? (
                  <LabelSheet
                    code={product.internal_code}
                    name={product.name}
                    price={product.recommended_selling_price}
                  />
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
