"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, RotateCcw, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { QuantityInput, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/components/common/money";
import { returnSaleItems, voidSale } from "@/lib/actions/sales";
import type { SaleStatus } from "@/lib/supabase/database.types";

interface ReturnableItem {
  id: string;
  productName: string;
  quantity: number;
  quantityReturned: number;
  unitSellingPrice: number;
}

/** Return items from a completed sale, or void the whole invoice. */
export function SaleActions({
  saleId,
  status,
  items,
}: {
  saleId: string;
  status: SaleStatus;
  items: ReturnableItem[];
}) {
  const canReturn = status === "completed" || status === "partially_returned";
  const canVoid = status !== "voided";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canReturn ? <ReturnDialog saleId={saleId} items={items} /> : null}
      {canVoid ? <VoidDialog saleId={saleId} /> : null}
    </div>
  );
}

function ReturnDialog({ saleId, items }: { saleId: string; items: ReturnableItem[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});

  const returnable = items.filter((i) => i.quantity - i.quantityReturned > 0);

  function setQty(id: string, max: number, value: number) {
    setQuantities((prev) => ({ ...prev, [id]: Math.max(0, Math.min(max, value)) }));
  }

  const totalRefund = returnable.reduce(
    (sum, i) => sum + (quantities[i.id] ?? 0) * i.unitSellingPrice,
    0,
  );
  const anySelected = Object.values(quantities).some((q) => q > 0);

  async function submit() {
    if (!anySelected) {
      toast.error("Choose at least one item to return.");
      return;
    }
    if (reason.trim().length < 3) {
      toast.error("Please give a reason for the return.");
      return;
    }
    setBusy(true);
    try {
      const result = await returnSaleItems({
        sale_id: saleId,
        reason,
        lines: returnable
          .filter((i) => (quantities[i.id] ?? 0) > 0)
          .map((i) => ({ sale_item_id: i.id, quantity: quantities[i.id] ?? 0 })),
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Return recorded");
      setOpen(false);
      setQuantities({});
      setReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <RotateCcw aria-hidden />
          Return items
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Return items</DialogTitle>
          <DialogDescription>
            Returned units go back into stock at their original cost, and this invoice&rsquo;s profit
            is recalculated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {returnable.map((item) => {
            const max = item.quantity - item.quantityReturned;
            const qty = quantities[item.id] ?? 0;
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-[--radius-md] border border-line p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{item.productName}</p>
                  <p className="text-xs text-muted">
                    {max} returnable · <Money value={item.unitSellingPrice} size="sm" className="text-muted" /> each
                  </p>
                </div>
                <div className="flex items-center rounded-[--radius-sm] border border-line-strong">
                  <button
                    type="button"
                    className="flex size-9 items-center justify-center text-ink hover:bg-surface-sunken disabled:opacity-40"
                    onClick={() => setQty(item.id, max, qty - 1)}
                    disabled={qty <= 0}
                    aria-label="Decrease"
                  >
                    <Minus className="size-4" aria-hidden />
                  </button>
                  <QuantityInput
                    value={String(qty)}
                    onChange={(e) => setQty(item.id, max, Number(e.target.value.replace(/\D/g, "")) || 0)}
                    className="h-9 w-10 border-0 shadow-none focus-visible:ring-0"
                  />
                  <button
                    type="button"
                    className="flex size-9 items-center justify-center text-ink hover:bg-surface-sunken disabled:opacity-40"
                    onClick={() => setQty(item.id, max, qty + 1)}
                    disabled={qty >= max}
                    aria-label="Increase"
                  >
                    <Plus className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="return-reason">Reason</Label>
          <Textarea
            id="return-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Wrong shade, customer changed her mind"
            rows={2}
          />
        </div>

        <DialogFooter>
          <div className="mr-auto text-sm text-muted">
            Refund: <Money value={totalRefund} className="font-semibold text-ink" />
          </div>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={!anySelected}>
            Record return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VoidDialog({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (reason.trim().length < 3) {
      toast.error("Please give a reason for voiding this sale.");
      return;
    }
    setBusy(true);
    try {
      const result = await voidSale({ sale_id: saleId, reason });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Sale voided");
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructiveOutline" size="sm">
          <Ban aria-hidden />
          Void sale
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void this sale?</DialogTitle>
          <DialogDescription>
            The invoice stays on record for your audit trail, but it will no longer count towards
            your profit and all its stock returns to inventory. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="void-reason">Reason</Label>
          <Textarea
            id="void-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Entered by mistake, duplicate"
            rows={2}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Keep sale
          </Button>
          <Button variant="destructive" onClick={submit} loading={busy}>
            Void sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
