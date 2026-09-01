"use server";

import { revalidatePath } from "next/cache";
import { productSchema, savePriceSchema, stockAdjustmentSchema } from "@/lib/schemas";
import { success, failure, withOwner, type ActionResult } from "./helpers";

/**
 * Product & inventory mutations.
 *
 * Products are written directly (RLS guards them); anything that touches cost
 * layers or the ledger goes through a SECURITY DEFINER RPC so the money is
 * always recomputed server-side.
 */

export async function createProduct(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return failure(parsed.error);

  return withOwner(async ({ userId, supabase }) => {
    const v = parsed.data;
    const { data, error } = await supabase
      .from("products")
      .insert({
        user_id: userId,
        name: v.name,
        brand: v.brand ?? null,
        shade_or_variant: v.shade_or_variant ?? null,
        size: v.size ?? null,
        category_id: v.category_id ?? null,
        sku: v.sku ?? null,
        manufacturer_barcode: v.manufacturer_barcode ?? null,
        description: v.description ?? null,
        image_url: v.image_url ?? null,
        recommended_selling_price: v.recommended_selling_price,
        minimum_selling_price: v.minimum_selling_price,
        low_stock_threshold: v.low_stock_threshold,
        is_active: v.is_active,
      })
      .select("id")
      .single();

    if (error) return failure(error);
    revalidatePath("/products");
    revalidatePath("/dashboard");
    return success({ id: data.id });
  });
}

export async function updateProduct(
  productId: string,
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return failure(parsed.error);

  return withOwner(async ({ userId, supabase }) => {
    const v = parsed.data;
    const { error } = await supabase
      .from("products")
      .update({
        name: v.name,
        brand: v.brand ?? null,
        shade_or_variant: v.shade_or_variant ?? null,
        size: v.size ?? null,
        category_id: v.category_id ?? null,
        sku: v.sku ?? null,
        manufacturer_barcode: v.manufacturer_barcode ?? null,
        description: v.description ?? null,
        image_url: v.image_url ?? null,
        recommended_selling_price: v.recommended_selling_price,
        minimum_selling_price: v.minimum_selling_price,
        low_stock_threshold: v.low_stock_threshold,
        is_active: v.is_active,
      })
      .eq("id", productId)
      .eq("user_id", userId);

    if (error) return failure(error);
    revalidatePath("/products");
    revalidatePath(`/products/${productId}`);
    revalidatePath("/dashboard");
    return success({ id: productId });
  });
}

/** Save a new selling price from the price simulator. */
export async function saveSellingPrice(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = savePriceSchema.safeParse(raw);
  if (!parsed.success) return failure(parsed.error);

  return withOwner(async ({ userId, supabase }) => {
    const v = parsed.data;
    const { error } = await supabase
      .from("products")
      .update({
        recommended_selling_price: v.recommended_selling_price,
        minimum_selling_price: v.minimum_selling_price,
      })
      .eq("id", v.product_id)
      .eq("user_id", userId);

    if (error) return failure(error);
    // A trigger records the change into product_price_history automatically.
    revalidatePath(`/products/${v.product_id}`);
    revalidatePath("/products");
    revalidatePath("/dashboard");
    return success({ id: v.product_id });
  });
}

/** Archive / restore. Archiving keeps history intact — it never deletes. */
export async function setProductActive(
  productId: string,
  isActive: boolean,
): Promise<ActionResult<{ id: string }>> {
  return withOwner(async ({ userId, supabase }) => {
    const { error } = await supabase
      .from("products")
      .update({ is_active: isActive })
      .eq("id", productId)
      .eq("user_id", userId);

    if (error) return failure(error);
    revalidatePath("/products");
    revalidatePath(`/products/${productId}`);
    return success({ id: productId });
  });
}

export async function adjustStock(raw: unknown): Promise<ActionResult<{ adjusted: number }>> {
  const parsed = stockAdjustmentSchema.safeParse(raw);
  if (!parsed.success) return failure(parsed.error);

  return withOwner(async ({ supabase }) => {
    const v = parsed.data;
    // The form collects a positive count and a direction; the RPC expects a
    // signed quantity.
    const signedQuantity = v.direction === "in" ? v.quantity : -v.quantity;

    const { data, error } = await supabase.rpc("adjust_stock", {
      p_product_id: v.product_id,
      p_movement_type: v.movement_type,
      p_quantity: signedQuantity,
      p_reason: v.reason,
      p_batch_id: v.batch_id ?? null,
    });

    if (error) return failure(error);
    revalidatePath(`/products/${v.product_id}`);
    revalidatePath("/products");
    revalidatePath("/movements");
    revalidatePath("/dashboard");
    return success({ adjusted: (data as { adjusted: number }).adjusted });
  });
}

// ── Categories ─────────────────────────────────────────────────────────────

export async function createCategory(
  name: string,
  color: string,
): Promise<ActionResult<{ id: string }>> {
  return withOwner(async ({ userId, supabase }) => {
    const { data, error } = await supabase
      .from("categories")
      .insert({ user_id: userId, name: name.trim(), color })
      .select("id")
      .single();
    if (error) return failure(error);
    revalidatePath("/products");
    return success({ id: data.id });
  });
}
