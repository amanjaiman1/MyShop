"use client";

import * as React from "react";
import { CheckCircle2, Loader2, TriangleAlert, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoneyInput, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LedgerRow } from "@/components/common/stat-card";
import { Money } from "@/components/common/money";
import { PriceStatusBadge } from "@/components/common/status-badge";
import { useShop } from "@/components/providers/shop-provider";
import { PAYMENT_METHODS } from "@/lib/constants";
import { resolvePriceStatus } from "@/lib/pricing";
import { formatPercent } from "@/lib/format";
import { marginPct, parseMoneyInput, toMoneyInput } from "@/lib/money";
import type { PaymentMethod, PreviewSaleResult } from "@/lib/supabase/database.types";

/**
 * The checkout rail: order-level discount, payment method, notes and the
 * authoritative totals from the preview RPC, followed by the complete-sale
 * action. The button's label and tone shift to signal a break-even or
 * loss-making sale before it is confirmed.
 */
export function CheckoutSummary({
  preview,
  loading,
  lineDiscountTotal,
  orderDiscount,
  paymentMethod,
  notes,
  online,
  submitting,
  onOrderDiscount,
  onPaymentMethod,
  onNotes,
  onComplete,
}: {
  preview: PreviewSaleResult | null;
  loading: boolean;
  /** Sum of per-line discounts from the cart (preview RPC doesn't see these). */
  lineDiscountTotal: number;
  orderDiscount: number;
  paymentMethod: PaymentMethod;
  notes: string;
  online: boolean;
  submitting: boolean;
  onOrderDiscount: (v: number) => void;
  onPaymentMethod: (m: PaymentMethod) => void;
  onNotes: (n: string) => void;
  onComplete: () => void;
}) {
  const { currency, lowMarginThreshold } = useShop();
  const [discountText, setDiscountText] = React.useState(toMoneyInput(orderDiscount));

  const subtotal = preview?.subtotal ?? 0;
  const cost = preview?.total_cost ?? 0;
  const totalDiscount = lineDiscountTotal + orderDiscount;
  const total = Math.max(0, subtotal - totalDiscount);
  // preview.gross_profit = subtotal − cost; discounts come off profit too.
  const grossProfit = (preview?.gross_profit ?? 0) - totalDiscount;
  const status = resolvePriceStatus(total, cost, lowMarginThreshold);

  const hasStockProblem = preview?.lines.some((l) => l.insufficient_stock) ?? false;
  const canComplete = online && !submitting && subtotal > 0 && !hasStockProblem;

  return (
    <div className="space-y-4">
      {/* Order discount + payment */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="order-discount">Order discount</Label>
          <MoneyInput
            id="order-discount"
            currencySymbol={currency.symbol}
            value={discountText}
            onChange={(e) => {
              setDiscountText(e.target.value);
              onOrderDiscount(parseMoneyInput(e.target.value) ?? 0);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payment-method">Payment</Label>
          <Select value={paymentMethod} onValueChange={(v) => onPaymentMethod(v as PaymentMethod)}>
            <SelectTrigger id="payment-method">
              <Wallet className="size-4 text-muted" aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Textarea
        value={notes}
        onChange={(e) => onNotes(e.target.value)}
        placeholder="Note for this sale (optional)"
        rows={2}
      />

      {/* Totals */}
      <div className="rounded-[--radius-lg] border border-line bg-surface-muted p-4">
        <div className="-my-2">
          <LedgerRow label="Revenue" value={<Money value={subtotal} />} />
          {lineDiscountTotal > 0 ? (
            <LedgerRow label="Line discounts" value={<Money value={-lineDiscountTotal} tone />} />
          ) : null}
          {orderDiscount > 0 ? (
            <LedgerRow label="Order discount" value={<Money value={-orderDiscount} tone />} />
          ) : null}
          <LedgerRow label="Cost of goods (FIFO)" value={<Money value={-cost} />} hint="frozen at today's cost" />
          <LedgerRow
            label="Expected gross profit"
            value={<Money value={grossProfit} tone showSign />}
            emphasis
            tone={grossProfit > 0 ? "profit" : grossProfit < 0 ? "loss" : "muted"}
          />
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
          <div>
            <p className="text-xs text-muted">Total to collect</p>
            <Money value={total} size="xl" className="text-ink-strong" />
          </div>
          <div className="flex flex-col items-end gap-1">
            {loading ? (
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> calculating…
              </span>
            ) : (
              <>
                <PriceStatusBadge status={status} />
                <span className="tnum text-xs text-muted">
                  {formatPercent(marginPct(grossProfit, total))} margin
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {!online ? (
        <p className="flex items-start gap-2 rounded-[--radius-sm] border border-loss-border bg-loss-soft px-3 py-2.5 text-sm text-loss">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          You are offline. A sale can only be completed with an internet connection — Aurelia will
          not record money it cannot confirm.
        </p>
      ) : null}

      <Button
        size="xl"
        block
        onClick={onComplete}
        disabled={!canComplete}
        loading={submitting}
        loadingText="Completing sale…"
        variant={status === "loss" ? "destructive" : "primary"}
      >
        <CheckCircle2 aria-hidden />
        {status === "loss"
          ? "Complete sale at a loss"
          : status === "breakeven"
            ? "Complete at break-even"
            : "Complete sale"}
      </Button>
    </div>
  );
}
