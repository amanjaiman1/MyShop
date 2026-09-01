"use server";

import { revalidatePath } from "next/cache";
import { purchaseSchema } from "@/lib/schemas";
import type { RecordPurchaseResult } from "@/lib/supabase/database.types";
import { success, failure, withOwner, type ActionResult } from "./helpers";

/**
 * Records a multi-line purchase through the record_purchase RPC.
 *
 * The RPC creates one batch per line (100 identical units = one batch of 100),
 * writes the matching stock movements and computes the investment total — the
 * browser never supplies a total.
 */
export async function recordPurchase(
  raw: unknown,
): Promise<ActionResult<RecordPurchaseResult>> {
  const parsed = purchaseSchema.safeParse(raw);
  if (!parsed.success) return failure(parsed.error);

  return withOwner(async ({ supabase }) => {
    const v = parsed.data;
    const { data, error } = await supabase.rpc("record_purchase", {
      p_lines: v.lines.map((line) => ({
        product_id: line.product_id,
        quantity: line.quantity,
        unit_cost: line.unit_cost,
        lot_number: line.lot_number ?? null,
        expiry_date: line.expiry_date ?? null,
      })),
      p_supplier_id: v.supplier_id ?? null,
      p_purchase_date: v.purchase_date,
      p_reference_number: v.reference_number ?? null,
      p_notes: v.notes ?? null,
    });

    if (error) return failure(error);

    revalidatePath("/purchases");
    revalidatePath("/products");
    revalidatePath("/movements");
    revalidatePath("/dashboard");
    return success(data as unknown as RecordPurchaseResult);
  });
}

// ── Suppliers ────────────────────────────────────────────────────────────────

import { supplierSchema } from "@/lib/schemas";

export async function createSupplier(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = supplierSchema.safeParse(raw);
  if (!parsed.success) return failure(parsed.error);

  return withOwner(async ({ userId, supabase }) => {
    const v = parsed.data;
    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        user_id: userId,
        name: v.name,
        phone: v.phone ?? null,
        email: v.email ?? null,
        address: v.address ?? null,
        notes: v.notes ?? null,
      })
      .select("id")
      .single();

    if (error) return failure(error);
    revalidatePath("/suppliers");
    revalidatePath("/purchases/new");
    return success({ id: data.id });
  });
}

export async function updateSupplier(
  supplierId: string,
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = supplierSchema.safeParse(raw);
  if (!parsed.success) return failure(parsed.error);

  return withOwner(async ({ userId, supabase }) => {
    const v = parsed.data;
    const { error } = await supabase
      .from("suppliers")
      .update({
        name: v.name,
        phone: v.phone ?? null,
        email: v.email ?? null,
        address: v.address ?? null,
        notes: v.notes ?? null,
      })
      .eq("id", supplierId)
      .eq("user_id", userId);

    if (error) return failure(error);
    revalidatePath("/suppliers");
    return success({ id: supplierId });
  });
}
