"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Barcode, Check, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, MoneyInput, QuantityInput, Textarea } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/misc";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ImageUpload } from "@/components/product/image-upload";
import { PriceSimulator } from "@/components/product/price-simulator";
import { ScannerButton } from "@/components/scan/scanner-button";
import { useShop } from "@/components/providers/shop-provider";
import { productSchema, type ProductValues } from "@/lib/schemas";
import { createProduct, updateProduct } from "@/lib/actions/products";
import { parseMoneyInput, toMoneyInput, type Minor } from "@/lib/money";
import type { CategoryRow, ProductOverviewRow } from "@/lib/supabase/database.types";

/**
 * Add / edit a product.
 *
 * The embedded PriceSimulator reads the recommended-price field live, so the
 * owner sees the margin verdict against the product's FIFO cost (on edit) while
 * they are still deciding the price — the same analysis the database will use.
 */
export function ProductForm({
  categories,
  product,
}: {
  categories: Pick<CategoryRow, "id" | "name">[];
  product?: ProductOverviewRow;
}) {
  const router = useRouter();
  const { currency } = useShop();
  const isEdit = Boolean(product);

  const form = useForm<ProductValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product?.name ?? "",
      brand: product?.brand ?? "",
      shade_or_variant: product?.shade_or_variant ?? "",
      size: product?.size ?? "",
      category_id: product?.category_id ?? null,
      sku: product?.sku ?? "",
      manufacturer_barcode: product?.manufacturer_barcode ?? "",
      description: product?.description ?? "",
      image_url: product?.image_url ?? null,
      recommended_selling_price: toMoneyInput(product?.recommended_selling_price ?? 0) as unknown as number,
      minimum_selling_price: toMoneyInput(product?.minimum_selling_price ?? 0) as unknown as number,
      low_stock_threshold: product?.low_stock_threshold ?? 5,
      is_active: product?.is_active ?? true,
    },
  });

  // Watch the price field so the simulator updates as the owner types.
  const priceText = form.watch("recommended_selling_price") as unknown as string;
  const minText = form.watch("minimum_selling_price") as unknown as string;
  const simulatedPrice: Minor = parseMoneyInput(priceText) ?? 0;

  async function onSubmit(values: ProductValues) {
    const result = isEdit
      ? await updateProduct(product!.id, values)
      : await createProduct(values);

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(isEdit ? "Product updated" : "Product created");
    router.push(`/products/${result.data.id}`);
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6 lg:grid-cols-3">
        {/* Left: identity & details */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Product details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField
                control={form.control}
                name="image_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Photo</FormLabel>
                    <ImageUpload
                      value={field.value ?? null}
                      name={form.watch("name")}
                      onChange={field.onChange}
                    />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Luxury Matte Lipstick" autoFocus />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="brand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} placeholder="e.g. Aurelia" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select
                        value={field.value ?? "none"}
                        onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No category</SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="shade_or_variant"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Shade / variant</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} placeholder="e.g. Ruby Rose" />
                      </FormControl>
                      <FormDescription>
                        Each distinct shade or size should be its own product.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="size"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Size</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} placeholder="e.g. 50 ml" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value ?? ""}
                        placeholder="Notes about this product (optional)"
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Codes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="manufacturer_barcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Manufacturer barcode</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="Scan or type"
                            inputMode="numeric"
                          />
                          <ScannerButton onScan={(code) => field.onChange(code)} />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Scan the printed barcode so you can find this product instantly at the till.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} placeholder="Your own code (optional)" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {isEdit && product ? (
                <p className="flex items-center gap-2 rounded-[--radius-sm] bg-surface-sunken px-3 py-2.5 text-xs text-muted">
                  <Barcode className="size-4 shrink-0 text-gold" aria-hidden />
                  Aurelia&rsquo;s internal code for this product is{" "}
                  <span className="font-mono font-medium text-ink">{product.internal_code}</span>.
                  You can print labels from the product page.
                </p>
              ) : (
                <p className="text-xs text-muted">
                  Aurelia will assign a printable internal code (like COS-000123) automatically when
                  you save.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: pricing */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField
                control={form.control}
                name="recommended_selling_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recommended selling price</FormLabel>
                    <FormControl>
                      <MoneyInput
                        currencySymbol={currency.symbol}
                        value={field.value as unknown as string}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="minimum_selling_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Minimum selling price</FormLabel>
                    <FormControl>
                      <MoneyInput
                        currencySymbol={currency.symbol}
                        value={field.value as unknown as string}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      The floor you refuse to sell below. Aurelia warns you if a price drops under it.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="low_stock_threshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Low-stock alert at</FormLabel>
                    <FormControl>
                      <QuantityInput
                        value={String(field.value ?? "")}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="w-24"
                      />
                    </FormControl>
                    <FormDescription>Warn me when stock falls to this many units.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Live analysis against FIFO cost when editing */}
          <div>
            <p className="eyebrow mb-2">Margin preview</p>
            <PriceSimulator
              variant="compact"
              label="Selling price"
              value={simulatedPrice}
              onChange={(v) => form.setValue("recommended_selling_price", toMoneyInput(v) as unknown as number)}
              fifoUnitCost={product?.fifo_unit_cost ?? null}
              recommendedPrice={parseMoneyInput(priceText) ?? 0}
              minimumPrice={parseMoneyInput(minText) ?? 0}
              quantityOnHand={product?.quantity_on_hand ?? 0}
              inventoryCost={product?.inventory_cost ?? 0}
              maxOpenBatchCost={product?.max_open_batch_cost ?? null}
            />
          </div>

          <FormField
            control={form.control}
            name="is_active"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-[--radius-md] border border-line bg-surface p-4">
                <div className="space-y-0.5">
                  <FormLabel>Active</FormLabel>
                  <FormDescription>Inactive products are hidden from the till.</FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <div className="flex gap-3">
            <Button
              type="submit"
              size="lg"
              block
              loading={form.formState.isSubmitting}
              loadingText="Saving…"
            >
              {isEdit ? <Check aria-hidden /> : <Save aria-hidden />}
              {isEdit ? "Save changes" : "Create product"}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
