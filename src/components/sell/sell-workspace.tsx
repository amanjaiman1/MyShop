"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { ProductPicker } from "@/components/product/product-picker";
import { CartLine } from "@/components/sell/cart-line";
import { CheckoutSummary } from "@/components/sell/checkout-summary";
import { useCart } from "@/lib/cart-store";
import { useOnline, offlineBlockReason } from "@/components/providers/online-provider";
import { createClient } from "@/lib/supabase/client";
import { completeSale } from "@/lib/actions/sales";
import { SALE_ERROR } from "@/lib/errors";
import type { PreviewSaleResult, ProductOverviewRow } from "@/lib/supabase/database.types";

/**
 * The point of sale.
 *
 * The cart lives in a persisted store; on every change the workspace asks the
 * `preview_sale` RPC for the authoritative FIFO cost and profit (debounced),
 * so the numbers the owner confirms are the numbers the database will record.
 * Loss and break-even sales require an explicit confirmation, surfaced from the
 * RPC's AU001/AU002 error codes.
 */
export function SellWorkspace() {
  const router = useRouter();
  const online = useOnline();

  const items = useCart((s) => s.items);
  const orderDiscount = useCart((s) => s.orderDiscount);
  const paymentMethod = useCart((s) => s.paymentMethod);
  const notes = useCart((s) => s.notes);
  const clientRequestId = useCart((s) => s.clientRequestId);
  const {
    addProduct,
    setQuantity,
    setUnitPrice,
    setLineDiscount,
    removeItem,
    setOrderDiscount,
    setPaymentMethod,
    setNotes,
    clear,
    reset,
  } = useCart();

  const [fetchedPreview, setPreview] = React.useState<PreviewSaleResult | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  // An empty cart has no preview by definition — derived rather than stored, so
  // clearing the cart needs no state update.
  const preview = items.length === 0 ? null : fetchedPreview;
  const [submitting, setSubmitting] = React.useState(false);
  const [confirm, setConfirm] = React.useState<null | "loss" | "breakeven">(null);

  const lineDiscountTotal = items.reduce((a, i) => a + i.lineDiscount, 0);

  // Debounced authoritative preview. A monotonically increasing id guards
  // against out-of-order responses when the owner types quickly.
  const reqId = React.useRef(0);
  React.useEffect(() => {
    if (items.length === 0) return;
    const id = ++reqId.current;
    const timer = setTimeout(async () => {
      // Flagged once the debounce actually fires, so rapid edits don't flicker
      // the spinner on every keystroke.
      setPreviewLoading(true);
      const supabase = createClient();
      const { data } = await supabase.rpc("preview_sale", {
        p_items: items.map((i) => ({
          product_id: i.productId,
          quantity: i.quantity,
          unit_selling_price: i.unitSellingPrice,
        })),
      });
      if (id !== reqId.current) return;
      setPreview((data as unknown as PreviewSaleResult) ?? null);
      setPreviewLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [items]);

  const previewByLine = React.useMemo(() => {
    const map = new Map<number, PreviewSaleResult["lines"][number]>();
    preview?.lines.forEach((l) => map.set(l.line_no, l));
    return map;
  }, [preview]);

  async function submit(confirmLoss: boolean, confirmBreakeven: boolean) {
    const reason = offlineBlockReason(online, "Completing a sale");
    if (reason) {
      toast.error(reason);
      return;
    }
    setSubmitting(true);
    try {
      const result = await completeSale({
        items: items.map((i) => ({
          product_id: i.productId,
          quantity: i.quantity,
          unit_selling_price: i.unitSellingPrice,
          line_discount: i.lineDiscount,
        })),
        order_discount: orderDiscount,
        payment_method: paymentMethod,
        notes: notes || null,
        client_request_id: clientRequestId,
        confirm_loss: confirmLoss,
        confirm_breakeven: confirmBreakeven,
      });

      if (!result.ok) {
        // Surface the RPC's deliberate confirmation prompts as a dialog.
        if (result.error.code === SALE_ERROR.CONFIRM_LOSS) {
          setConfirm("loss");
          return;
        }
        if (result.error.code === SALE_ERROR.CONFIRM_BREAKEVEN) {
          setConfirm("breakeven");
          return;
        }
        toast.error(result.error.message);
        return;
      }

      const saleId = result.data.sale_id;
      reset(); // empties the cart and rotates the idempotency key
      router.push(`/sales/${saleId}?new=1`);
      router.refresh();
    } finally {
      setSubmitting(false);
      setConfirm(null);
    }
  }

  function handleComplete() {
    void submit(false, false);
  }

  const handleSelect = React.useCallback(
    (product: ProductOverviewRow) => {
      addProduct(product);
      toast.success(`${product.name} added`, { duration: 1500 });
    },
    [addProduct],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Picker */}
      <div className="lg:col-span-2">
        <Card className="lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>Add to sale</CardTitle>
          </CardHeader>
          <CardContent>
            <ProductPicker onSelect={handleSelect} requireStock autoFocus />
          </CardContent>
        </Card>
      </div>

      {/* Cart + checkout */}
      <div className="space-y-4 lg:col-span-3">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="size-4 text-muted" aria-hidden />
                Current sale
                {items.length > 0 ? (
                  <span className="rounded-[--radius-pill] bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
                    {items.length}
                  </span>
                ) : null}
              </CardTitle>
              {items.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={clear}>
                  <Trash2 aria-hidden />
                  Clear
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <EmptyState
                compact
                icon={ShoppingCart}
                title="No items yet"
                description="Scan or search a product to start a sale. You'll see the profit on every line before you complete it."
              />
            ) : (
              <ul className="space-y-3">
                {items.map((item, index) => (
                  <CartLine
                    key={item.key}
                    item={item}
                    preview={previewByLine.get(index + 1)}
                    onQuantity={(q) => setQuantity(item.key, q)}
                    onPrice={(p) => setUnitPrice(item.key, p)}
                    onLineDiscount={(d) => setLineDiscount(item.key, d)}
                    onRemove={() => removeItem(item.key)}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {items.length > 0 ? (
          <Card>
            <CardContent className="p-5">
              <CheckoutSummary
                preview={preview}
                loading={previewLoading}
                lineDiscountTotal={lineDiscountTotal}
                orderDiscount={orderDiscount}
                paymentMethod={paymentMethod}
                notes={notes}
                online={online}
                submitting={submitting}
                onOrderDiscount={setOrderDiscount}
                onPaymentMethod={setPaymentMethod}
                onNotes={setNotes}
                onComplete={handleComplete}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Loss / break-even confirmation */}
      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "loss" ? "This sale loses money" : "This sale only breaks even"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "loss"
                ? "One or more items — or the order as a whole — will sell below cost. Are you sure you want to record this sale?"
                : "This sale exactly covers your cost, with no profit. Record it anyway?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void submit(confirm === "loss", true)}
            >
              Yes, complete the sale
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
