"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Coins,
  Package,
  Plus,
  Printer,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, MoneyInput, QuantityInput, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProductThumb } from "@/components/common/product-thumb";
import { Money } from "@/components/common/money";
import { PriceStatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { ProductPicker } from "@/components/product/product-picker";
import { SupplierPicker, type SupplierOption } from "@/components/purchase/supplier-picker";
import { LabelSheet } from "@/components/scan/label-sheet";
import { useShop } from "@/components/providers/shop-provider";
import { useOnline, offlineBlockReason } from "@/components/providers/online-provider";
import { recordPurchase } from "@/lib/actions/purchases";
import { resolvePriceStatus } from "@/lib/pricing";
import { parseMoneyInput, type Minor } from "@/lib/money";
import { formatMoney } from "@/lib/format";
import type { ProductOverviewRow } from "@/lib/supabase/database.types";

interface DraftLine {
  key: string;
  product: ProductOverviewRow;
  quantityText: string;
  unitCostText: string;
  lot: string;
  expiry: string;
}

/**
 * The "Record purchase" workflow.
 *
 * Choose a supplier, add products (search or scan), enter quantity + unit cost,
 * optionally lot/expiry, watch the total investment build, and save. The RPC
 * turns each line into one FIFO batch (100 identical units => one batch of 100)
 * and writes the matching stock movements. Afterwards the owner is offered
 * printable labels for what they just bought.
 */
export function RecordPurchaseForm({
  suppliers,
  today,
}: {
  suppliers: SupplierOption[];
  today: string;
}) {
  const router = useRouter();
  const { currency, lowMarginThreshold } = useShop();
  const online = useOnline();

  const [supplierId, setSupplierId] = React.useState<string | null>(null);
  const [purchaseDate, setPurchaseDate] = React.useState(today);
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<DraftLine[]>([]);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [savedLabels, setSavedLabels] = React.useState<
    { reference: string; items: ProductOverviewRow[] } | null
  >(null);

  function addProduct(product: ProductOverviewRow) {
    setLines((prev) => {
      if (prev.some((l) => l.product.id === product.id)) {
        toast.info(`${product.name} is already in this purchase.`);
        return prev;
      }
      return [
        ...prev,
        {
          key: crypto.randomUUID(),
          product,
          quantityText: "1",
          // Default the cost to the last known cost, a helpful starting point.
          unitCostText:
            product.latest_unit_cost !== null
              ? String(product.latest_unit_cost / 100)
              : "",
          lot: "",
          expiry: "",
        },
      ];
    });
    setPickerOpen(false);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const totals = React.useMemo(() => {
    let units = 0;
    let investment = 0;
    for (const line of lines) {
      const qty = Number(line.quantityText.replace(/\D/g, "")) || 0;
      const cost = parseMoneyInput(line.unitCostText) ?? 0;
      units += qty;
      investment += qty * cost;
    }
    return { units, investment };
  }, [lines]);

  async function handleSave() {
    const reason = offlineBlockReason(online, "Recording a purchase");
    if (reason) {
      toast.error(reason);
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one product.");
      return;
    }

    setSaving(true);
    try {
      const result = await recordPurchase({
        supplier_id: supplierId,
        purchase_date: purchaseDate,
        reference_number: reference || null,
        notes: notes || null,
        lines: lines.map((l) => ({
          product_id: l.product.id,
          quantity: Number(l.quantityText.replace(/\D/g, "")) || 0,
          unit_cost: l.unitCostText,
          lot_number: l.lot || null,
          expiry_date: l.expiry || null,
        })),
      });

      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }

      toast.success(
        `Purchase ${result.data.reference_number} recorded — ${result.data.total_units} units added`,
      );
      // Offer labels for what was just bought before navigating away.
      setSavedLabels({ reference: result.data.reference_number, items: lines.map((l) => l.product) });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {/* Supplier + meta */}
        <Card>
          <CardHeader>
            <CardTitle>Purchase details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Supplier</Label>
              <SupplierPicker suppliers={suppliers} value={supplierId} onChange={setSupplierId} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purchase-date">Purchase date</Label>
              <div className="relative">
                <CalendarDays
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                  aria-hidden
                />
                <Input
                  id="purchase-date"
                  type="date"
                  value={purchaseDate}
                  max={today}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reference">Reference / bill no. (optional)</Label>
              <Input
                id="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Auto-generated if blank"
              />
            </div>
          </CardContent>
        </Card>

        {/* Line items */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Products</CardTitle>
              <Button size="sm" onClick={() => setPickerOpen(true)}>
                <Plus aria-hidden />
                Add product
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {lines.length === 0 ? (
              <EmptyState
                compact
                icon={Package}
                title="No products yet"
                description="Search or scan to add the items you bought in this purchase."
                action={
                  <Button size="sm" onClick={() => setPickerOpen(true)}>
                    <Plus aria-hidden />
                    Add product
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3">
                {lines.map((line) => (
                  <PurchaseLineRow
                    key={line.key}
                    line={line}
                    currencySymbol={currency.symbol}
                    lowMarginThreshold={lowMarginThreshold}
                    onChange={(patch) => updateLine(line.key, patch)}
                    onRemove={() => removeLine(line.key)}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary rail */}
      <div className="space-y-4">
        <Card tone="champagne" className="lg:sticky lg:top-6">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <Coins className="size-4 text-gold" aria-hidden />
              <p className="eyebrow !text-gold">Total investment</p>
            </div>
            <Money value={totals.investment} size="hero" className="block text-ink-strong" />
            <div className="flex items-center gap-4 text-sm text-muted">
              <span>
                <span className="tnum font-semibold text-ink">{lines.length}</span> product
                {lines.length === 1 ? "" : "s"}
              </span>
              <span>
                <span className="tnum font-semibold text-ink">{totals.units}</span> units
              </span>
            </div>

            {!online ? (
              <p className="flex items-start gap-2 rounded-[--radius-sm] border border-loss-border bg-loss-soft px-3 py-2 text-xs text-loss">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                You are offline. Reconnect to save this purchase.
              </p>
            ) : null}

            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes about this purchase (optional)"
              rows={2}
            />

            <Button
              size="lg"
              block
              onClick={handleSave}
              disabled={lines.length === 0 || !online}
              loading={saving}
              loadingText="Saving…"
            >
              <CheckCircle2 aria-hidden />
              Save purchase
            </Button>
            <p className="text-center text-xs text-muted">
              This adds stock and cost layers. It is an investment, not an expense — it becomes cost
              of goods sold only when you sell.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Product picker dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a product</DialogTitle>
            <DialogDescription>Search your catalogue or scan a barcode.</DialogDescription>
          </DialogHeader>
          <ProductPicker
            onSelect={addProduct}
            excludeIds={lines.map((l) => l.product.id)}
            autoFocus
          />
          <p className="text-center text-xs text-muted">
            Not in your catalogue yet?{" "}
            <Link href="/products/new" className="font-medium text-primary hover:underline">
              Create the product first
            </Link>
            .
          </p>
        </DialogContent>
      </Dialog>

      {/* Post-save label offer */}
      <Dialog open={Boolean(savedLabels)} onOpenChange={(o) => !o && finishAfterSave()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-profit" aria-hidden />
              Purchase recorded
            </DialogTitle>
            <DialogDescription>
              {savedLabels?.reference} · {totals.units} units added to your inventory. Would you like
              to print labels for these products?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {savedLabels?.items.map((product) => (
              <div
                key={product.id}
                className="flex items-center gap-3 rounded-[--radius-md] border border-line bg-surface p-2.5"
              >
                <ProductThumb src={product.image_url} name={product.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{product.name}</p>
                  <p className="font-mono text-xs text-muted">{product.internal_code}</p>
                </div>
                <LabelSheet
                  code={product.internal_code}
                  name={product.name}
                  price={product.recommended_selling_price}
                  trigger={
                    <Button variant="outline" size="sm">
                      <Printer aria-hidden />
                      Labels
                    </Button>
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" block onClick={finishAfterSave}>
              Done
            </Button>
            <Button block onClick={() => startAnother()}>
              Record another
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  function finishAfterSave() {
    setSavedLabels(null);
    router.push("/purchases");
    router.refresh();
  }

  function startAnother() {
    setSavedLabels(null);
    setLines([]);
    setReference("");
    setNotes("");
    toast.success("Ready for the next purchase");
  }
}

function PurchaseLineRow({
  line,
  currencySymbol,
  lowMarginThreshold,
  onChange,
  onRemove,
}: {
  line: DraftLine;
  currencySymbol: string;
  lowMarginThreshold: number;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}) {
  const qty = Number(line.quantityText.replace(/\D/g, "")) || 0;
  const cost: Minor = parseMoneyInput(line.unitCostText) ?? 0;
  const lineTotal = qty * cost;
  const rsp = line.product.recommended_selling_price;

  // Warn if the price the shop plans to sell at wouldn't clear this new cost.
  const status = resolvePriceStatus(rsp, cost, lowMarginThreshold);
  const willLose = cost > 0 && rsp > 0 && rsp <= cost;

  return (
    <li className="rounded-[--radius-lg] border border-line bg-surface p-3">
      <div className="flex items-start gap-3">
        <ProductThumb src={line.product.image_url} name={line.product.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-strong">{line.product.name}</p>
          <p className="truncate text-xs text-muted">
            {[line.product.brand, line.product.shade_or_variant].filter(Boolean).join(" · ") ||
              line.product.internal_code}
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-subtle">
            Sells at {formatMoney(rsp, { code: "INR", symbol: currencySymbol })}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="flex size-8 items-center justify-center rounded-[--radius-xs] text-muted transition-colors hover:bg-loss-soft hover:text-loss"
          aria-label="Remove product"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Quantity</Label>
          <QuantityInput
            value={line.quantityText}
            onChange={(e) => onChange({ quantityText: e.target.value })}
            aria-label="Quantity"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Unit cost</Label>
          <MoneyInput
            currencySymbol={currencySymbol}
            value={line.unitCostText}
            onChange={(e) => onChange({ unitCostText: e.target.value })}
            aria-label="Unit cost"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Lot no. (optional)</Label>
          <Input
            value={line.lot}
            onChange={(e) => onChange({ lot: e.target.value })}
            aria-label="Lot number"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Expiry (optional)</Label>
          <Input
            type="date"
            value={line.expiry}
            onChange={(e) => onChange({ expiry: e.target.value })}
            aria-label="Expiry date"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div className="flex items-center gap-2">
          {cost > 0 && rsp > 0 ? (
            <>
              <PriceStatusBadge status={status} size="sm" />
              {willLose ? (
                <span className="text-xs font-medium text-loss">
                  Your selling price is below this cost!
                </span>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="text-right">
          <span className="text-xs text-muted">Line total </span>
          <Money value={lineTotal} size="default" className="font-semibold" />
        </div>
      </div>
    </li>
  );
}
