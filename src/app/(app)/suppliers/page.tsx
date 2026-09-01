import type { Metadata } from "next";
import { Gem, Mail, Phone, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Money } from "@/components/common/money";
import { SupplierDialog } from "@/components/supplier/supplier-dialog";
import { createClient } from "@/lib/supabase/server";
import { initials } from "@/lib/utils";
import type { SupplierRow } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Suppliers" };
export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const supabase = await createClient();

  const { data: suppliersRaw } = await supabase
    .from("suppliers")
    .select("*")
    .order("name");
  const suppliers = (suppliersRaw ?? []) as SupplierRow[];

  // Aggregate spend per supplier from purchase batches.
  const { data: batchesRaw } = await supabase
    .from("purchase_batches")
    .select("supplier_id, quantity_purchased, unit_cost");
  const spendBySupplier = new Map<string, { spend: number; units: number }>();
  for (const b of (batchesRaw ?? []) as Array<{
    supplier_id: string | null;
    quantity_purchased: number;
    unit_cost: number;
  }>) {
    if (!b.supplier_id) continue;
    const agg = spendBySupplier.get(b.supplier_id) ?? { spend: 0, units: 0 };
    agg.spend += b.quantity_purchased * b.unit_cost;
    agg.units += b.quantity_purchased;
    spendBySupplier.set(b.supplier_id, agg);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalogue"
        title="Suppliers"
        description="The businesses you buy your stock from."
        actions={<SupplierDialog />}
      />

      {suppliers.length === 0 ? (
        <EmptyState
          icon={Gem}
          title="No suppliers yet"
          description="Add the wholesalers and distributors you buy from, so you can attach them to purchases and track spend."
          action={<SupplierDialog />}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((supplier) => {
            const agg = spendBySupplier.get(supplier.id);
            return (
              <Card key={supplier.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-[--radius-md] bg-plum-soft text-sm font-semibold text-plum">
                      {initials(supplier.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-ink-strong">{supplier.name}</h3>
                      {agg ? (
                        <p className="text-xs text-muted">
                          <Money value={agg.spend} size="sm" className="text-muted" /> · {agg.units} units
                        </p>
                      ) : (
                        <p className="text-xs text-subtle">No purchases yet</p>
                      )}
                    </div>
                    <SupplierDialog
                      supplier={supplier}
                      trigger={
                        <Button variant="ghost" size="iconSm" aria-label={`Edit ${supplier.name}`}>
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                      }
                    />
                  </div>

                  <div className="mt-auto space-y-1.5 border-t border-line pt-3">
                    {supplier.phone ? (
                      <a
                        href={`tel:${supplier.phone}`}
                        className="flex items-center gap-2 text-sm text-muted hover:text-primary"
                      >
                        <Phone className="size-3.5" aria-hidden />
                        {supplier.phone}
                      </a>
                    ) : null}
                    {supplier.email ? (
                      <a
                        href={`mailto:${supplier.email}`}
                        className="flex items-center gap-2 text-sm text-muted hover:text-primary"
                      >
                        <Mail className="size-3.5" aria-hidden />
                        <span className="truncate">{supplier.email}</span>
                      </a>
                    ) : null}
                    {!supplier.phone && !supplier.email ? (
                      <p className="text-xs text-subtle">No contact details</p>
                    ) : null}
                    {supplier.notes ? (
                      <p className="line-clamp-2 text-xs text-muted">{supplier.notes}</p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
