"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SlidersHorizontal } from "lucide-react";
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/misc";
import { Label } from "@/components/ui/label";
import { adjustStock } from "@/lib/actions/products";
import { ADJUSTMENT_TYPES } from "@/lib/constants";
import { stockAdjustmentSchema, type StockAdjustmentValues } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/**
 * Records damage, expiry, supplier returns and recounts. A reason is mandatory
 * (the RPC also enforces it) so the movement ledger stays trustworthy.
 */
export function StockAdjustDialog({
  productId,
  quantityOnHand,
}: {
  productId: string;
  quantityOnHand: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const form = useForm<StockAdjustmentValues>({
    resolver: zodResolver(stockAdjustmentSchema),
    defaultValues: {
      product_id: productId,
      movement_type: "damaged",
      direction: "out",
      quantity: 1,
      reason: "",
      batch_id: null,
    },
  });

  const movementType = form.watch("movement_type");
  const canChooseDirection = movementType === "manual_adjustment";

  async function onSubmit(values: StockAdjustmentValues) {
    const result = await adjustStock(values);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Stock adjusted");
    setOpen(false);
    form.reset({
      product_id: productId,
      movement_type: "damaged",
      direction: "out",
      quantity: 1,
      reason: "",
      batch_id: null,
    });
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal aria-hidden />
          Adjust stock
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {quantityOnHand} unit{quantityOnHand === 1 ? "" : "s"} on hand. Removals consume the
            oldest batch first, so your FIFO cost stays accurate.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="movement_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason type</FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {ADJUSTMENT_TYPES.map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => {
                          field.onChange(type.value);
                          if (type.value !== "manual_adjustment") {
                            form.setValue("direction", "out");
                          }
                        }}
                        className={cn(
                          "rounded-[--radius-sm] border p-3 text-left transition-colors",
                          field.value === type.value
                            ? "border-primary bg-primary-soft"
                            : "border-line hover:bg-surface-muted",
                        )}
                      >
                        <span className="block text-sm font-medium text-ink">{type.label}</span>
                        <span className="block text-xs text-muted">{type.hint}</span>
                      </button>
                    ))}
                  </div>
                </FormItem>
              )}
            />

            {canChooseDirection ? (
              <FormField
                control={form.control}
                name="direction"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Direction</FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="flex gap-4"
                      >
                        <Label className="flex items-center gap-2 font-normal">
                          <RadioGroupItem value="out" /> Remove units
                        </Label>
                        <Label className="flex items-center gap-2 font-normal">
                          <RadioGroupItem value="in" /> Add units
                        </Label>
                      </RadioGroup>
                    </FormControl>
                    <FormDescription>
                      Use “Add” only to correct a recount that is short.
                    </FormDescription>
                  </FormItem>
                )}
              />
            ) : null}

            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>How many units?</FormLabel>
                  <FormControl>
                    <QuantityInput
                      value={String(field.value ?? "")}
                      onChange={(e) => field.onChange(e.target.value)}
                      className="w-28"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={2}
                      placeholder="e.g. Two tubes cracked during delivery"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting} loadingText="Saving…">
                Record adjustment
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
