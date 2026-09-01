import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Money } from "@/components/common/money";
import { StatCard } from "@/components/common/stat-card";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { ChevronRight, Coins, Package } from "lucide-react";

export const metadata: Metadata = { title: "Purchases" };
export const dynamic = "force-dynamic";

interface PurchaseGroup {
  reference: string;
  date: string;
  supplierName: string | null;
  productCount: number;
  units: number;
  investment: number;
}

export default async function PurchasesPage() {
  const supabase = await createClient();

  // Batches carry the purchase document reference; group them into purchases.
  const { data } = await supabase
    .from("purchase_batches")
    .select(
      "id, reference_number, purchase_date, quantity_purchased, unit_cost, product_id, supplier_id, suppliers(name)",
    )
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);

  type Row = {
    reference_number: string | null;
    purchase_date: string;
    quantity_purchased: number;
    unit_cost: number;
    product_id: string;
    suppliers: { name: string } | { name: string }[] | null;
  };

  const rows = (data ?? []) as unknown as Row[];
  const groups = new Map<string, PurchaseGroup & { products: Set<string> }>();

  for (const row of rows) {
    const ref = row.reference_number ?? `${row.purchase_date}·unfiled`;
    let group = groups.get(ref);
    if (!group) {
      const supplier = Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers;
      group = {
        reference: ref,
        date: row.purchase_date,
        supplierName: supplier?.name ?? null,
        productCount: 0,
        units: 0,
        investment: 0,
        products: new Set<string>(),
      };
      groups.set(ref, group);
    }
    group.products.add(row.product_id);
    group.units += row.quantity_purchased;
    group.investment += row.quantity_purchased * row.unit_cost;
  }

  const purchases = [...groups.values()]
    .map((g) => ({ ...g, productCount: g.products.size }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.reference.localeCompare(a.reference));

  const totalInvestment = purchases.reduce((a, p) => a + p.investment, 0);
  const totalUnits = purchases.reduce((a, p) => a + p.units, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Purchases"
        title="Purchases"
        description="Every batch of stock you've bought, grouped by purchase."
        actions={
          <Button asChild size="sm">
            <Link href="/purchases/new">
              <Plus aria-hidden />
              Record purchase
            </Link>
          </Button>
        }
      />

      {purchases.length === 0 ? (
        <EmptyState
          icon={Truck}
          eyebrow="Stock in"
          title="No purchases recorded yet"
          description="Record your first purchase to add stock and set the cost Aurelia uses to work out your profit."
          action={
            <Button asChild>
              <Link href="/purchases/new">
                <Plus aria-hidden />
                Record purchase
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <StatCard
              label="Total invested"
              value={<Money value={totalInvestment} size="xl" />}
              icon={Coins}
              tone="gold"
              hint={`across ${purchases.length} purchases`}
            />
            <StatCard
              label="Units purchased"
              value={totalUnits.toLocaleString("en-IN")}
              icon={Package}
              tone="primary"
            />
          </div>

          <Card>
            <CardContent className="p-0">
              <ul>
                {purchases.map((p) => (
                  <li key={p.reference}>
                    <Link
                      href={`/purchases/${encodeURIComponent(p.reference)}`}
                      className="flex items-center gap-4 border-b border-line px-4 py-3.5 transition-colors last:border-0 hover:bg-surface-muted"
                    >
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-[--radius-sm] bg-gold-soft text-gold">
                        <Truck className="size-5" strokeWidth={1.75} aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-sm font-medium text-ink-strong">
                          {p.reference}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {formatDate(p.date)}
                          {p.supplierName ? ` · ${p.supplierName}` : ""} · {p.productCount} product
                          {p.productCount === 1 ? "" : "s"} · {p.units} units
                        </p>
                      </div>
                      <Money value={p.investment} size="default" className="font-semibold" />
                      <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
