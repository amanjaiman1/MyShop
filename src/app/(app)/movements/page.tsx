import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ExportButton } from "@/components/common/export-button";
import { MovementsFilter } from "@/components/movement/movements-filter";
import {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/queries";
import { formatDateTime } from "@/lib/format";
import { MOVEMENT_TYPE_LABELS } from "@/lib/constants";
import type { StockMovementType } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Stock movements" };
export const dynamic = "force-dynamic";

const INFLOW: StockMovementType[] = ["purchase", "sale_return"];

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; product?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const profile = await getProfile();

  let query = supabase
    .from("stock_movements")
    .select(
      "id, movement_type, quantity, notes, created_at, product_id, products(name, internal_code)",
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (sp.type && sp.type in MOVEMENT_TYPE_LABELS) {
    query = query.eq("movement_type", sp.type as StockMovementType);
  }
  if (sp.product) query = query.eq("product_id", sp.product);

  const { data } = await query;
  type Row = {
    id: string;
    movement_type: StockMovementType;
    quantity: number;
    notes: string | null;
    created_at: string;
    product_id: string;
    products: { name: string; internal_code: string } | null;
  };
  const movements = (data ?? []) as unknown as Row[];

  const productName = movements.find((m) => m.product_id === sp.product)?.products?.name;

  const exportRows = movements.map((m) => ({
    when: m.created_at,
    product: m.products?.name ?? "",
    code: m.products?.internal_code ?? "",
    type: MOVEMENT_TYPE_LABELS[m.movement_type],
    quantity: m.quantity,
    notes: m.notes ?? "",
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalogue"
        title="Stock movements"
        description="A complete audit of every unit that entered or left your inventory."
        actions={
          <ExportButton
            rows={exportRows}
            columns={[
              { header: "When", key: "when" },
              { header: "Product", key: "product" },
              { header: "Code", key: "code" },
              { header: "Type", key: "type" },
              { header: "Quantity", key: "quantity" },
              { header: "Notes", key: "notes" },
            ]}
            kind="stock-movements"
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <MovementsFilter />
        {sp.product && productName ? (
          <Badge variant="primary" className="gap-1.5">
            {productName}
            <Link href="/movements" aria-label="Clear product filter">
              <X className="size-3" aria-hidden />
            </Link>
          </Badge>
        ) : null}
      </div>

      {movements.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="No movements yet"
          description="Every purchase, sale, return and adjustment is recorded here as it happens."
          action={
            <Button asChild>
              <Link href="/purchases/new">Record a purchase</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <TableWrapper className="rounded-[--radius-lg] border-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead numeric>Change</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => {
                    const inflow = INFLOW.includes(m.movement_type) || m.quantity > 0;
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <Link
                            href={`/products/${m.product_id}`}
                            className="font-medium text-ink hover:text-primary"
                          >
                            {m.products?.name ?? "Product"}
                          </Link>
                          {m.notes ? (
                            <p className="text-xs text-subtle line-clamp-1">{m.notes}</p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted">
                            {MOVEMENT_TYPE_LABELS[m.movement_type]}
                          </span>
                        </TableCell>
                        <TableCell numeric>
                          <span className={inflow ? "font-medium text-profit" : "font-medium text-loss"}>
                            {m.quantity > 0 ? "+" : ""}
                            {m.quantity}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted">
                            {formatDateTime(m.created_at, profile.timezone)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableWrapper>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
