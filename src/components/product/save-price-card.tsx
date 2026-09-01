"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { PriceSimulator } from "@/components/product/price-simulator";
import { useShop } from "@/components/providers/shop-provider";
import { saveSellingPrice } from "@/lib/actions/products";
import { resolvePriceStatus } from "@/lib/pricing";
import { parseMoneyInput, toMoneyInput, type Minor } from "@/lib/money";
import type { ProductOverviewRow } from "@/lib/supabase/database.types";

/**
 * The product page's pricing workstation: a full price simulator plus explicit
 * "Save selling price" and "Save minimum" controls. Saving a loss-making or
 * break-even recommended price requires a deliberate confirmation, so the owner
 * can never quietly persist a price that loses money.
 */
export function SavePriceCard({ product }: { product: ProductOverviewRow }) {
  const router = useRouter();
  const { currency, lowMarginThreshold } = useShop();

  const [price, setPrice] = React.useState<Minor>(product.recommended_selling_price);
  const [minText, setMinText] = React.useState<string>(
    toMoneyInput(product.minimum_selling_price),
  );
  const [saving, setSaving] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const minPrice = parseMoneyInput(minText) ?? 0;
  const dirty =
    price !== product.recommended_selling_price || minPrice !== product.minimum_selling_price;

  const status = resolvePriceStatus(price, product.fifo_unit_cost, lowMarginThreshold);
  const needsConfirm = status === "loss" || status === "breakeven";

  async function persist() {
    setSaving(true);
    try {
      const result = await saveSellingPrice({
        product_id: product.id,
        recommended_selling_price: toMoneyInput(price),
        minimum_selling_price: minText,
        confirm_unprofitable: true,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Selling price saved");
      router.refresh();
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }

  function handleSave() {
    if (minPrice > price) {
      toast.error("Your minimum price cannot be above your selling price.");
      return;
    }
    if (needsConfirm) {
      setConfirmOpen(true);
      return;
    }
    void persist();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Price simulator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <PriceSimulator
          value={price}
          onChange={setPrice}
          label="Try a selling price"
          fifoUnitCost={product.fifo_unit_cost}
          recommendedPrice={product.recommended_selling_price}
          minimumPrice={minPrice}
          quantityOnHand={product.quantity_on_hand}
          inventoryCost={product.inventory_cost}
          maxOpenBatchCost={product.max_open_batch_cost}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="min-price">Minimum selling price</Label>
            <MoneyInput
              id="min-price"
              currencySymbol={currency.symbol}
              value={minText}
              onChange={(e) => setMinText(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              onClick={handleSave}
              disabled={!dirty}
              loading={saving}
              loadingText="Saving…"
              block
            >
              <Save aria-hidden />
              Save selling price
            </Button>
            {dirty ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Reset"
                onClick={() => {
                  setPrice(product.recommended_selling_price);
                  setMinText(toMoneyInput(product.minimum_selling_price));
                }}
              >
                <RotateCcw className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-muted">
          Simulate freely — nothing changes until you press{" "}
          <span className="font-medium text-ink">Save selling price</span>.
        </p>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {status === "loss" ? "Save a loss-making price?" : "Save a break-even price?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {status === "loss"
                ? "This selling price is below your purchase cost. Every unit sold at this price will lose money. Save it anyway?"
                : "This selling price only covers your cost — you make no profit on it. Save it anyway?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void persist()}>
              Save this price
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
