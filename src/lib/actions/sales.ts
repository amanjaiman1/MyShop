"use server";

import { revalidatePath } from "next/cache";
import { checkoutSchema, returnSchema, voidSaleSchema } from "@/lib/schemas";
import type { CompleteSaleResult } from "@/lib/supabase/database.types";
import { success, failure, withOwner, type ActionResult } from "./helpers";

/**
 * Completes a sale through the FIFO complete_sale RPC.
 *
 * The client sends only the owner's choices — product, quantity, price,
 * discount — plus a stable client_request_id for idempotency and the two
 * confirmation flags. The RPC recomputes every figure, allocates FIFO cost
 * layers, freezes cost snapshots and returns the authoritative totals.
 */
export async function completeSale(raw: unknown): Promise<ActionResult<CompleteSaleResult>> {
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) return failure(parsed.error);

  return withOwner(async ({ supabase }) => {
    const v = parsed.data;
    const { data, error } = await supabase.rpc("complete_sale", {
      p_items: v.items.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_selling_price: item.unit_selling_price,
        line_discount: item.line_discount ?? 0,
      })),
      p_payment_method: v.payment_method,
      p_order_discount: v.order_discount ?? 0,
      p_notes: v.notes ?? null,
      p_client_request_id: v.client_request_id,
      p_sale_date: null,
      p_confirm_loss: v.confirm_loss,
      p_confirm_breakeven: v.confirm_breakeven,
    });

    if (error) return failure(error);

    revalidatePath("/sales");
    revalidatePath("/products");
    revalidatePath("/movements");
    revalidatePath("/dashboard");
    return success(data as unknown as CompleteSaleResult);
  });
}

export async function returnSaleItems(raw: unknown): Promise<ActionResult<{ status: string }>> {
  const parsed = returnSchema.safeParse(raw);
  if (!parsed.success) return failure(parsed.error);

  return withOwner(async ({ supabase }) => {
    const v = parsed.data;
    const { data, error } = await supabase.rpc("return_sale_items", {
      p_sale_id: v.sale_id,
      p_lines: v.lines.map((l) => ({ sale_item_id: l.sale_item_id, quantity: l.quantity })),
      p_reason: v.reason,
    });

    if (error) return failure(error);
    revalidatePath("/sales");
    revalidatePath(`/sales/${v.sale_id}`);
    revalidatePath("/products");
    revalidatePath("/movements");
    revalidatePath("/dashboard");
    return success(data as { status: string });
  });
}

export async function voidSale(raw: unknown): Promise<ActionResult<{ status: string }>> {
  const parsed = voidSaleSchema.safeParse(raw);
  if (!parsed.success) return failure(parsed.error);

  return withOwner(async ({ supabase }) => {
    const v = parsed.data;
    const { data, error } = await supabase.rpc("void_sale", {
      p_sale_id: v.sale_id,
      p_reason: v.reason,
    });

    if (error) return failure(error);
    revalidatePath("/sales");
    revalidatePath(`/sales/${v.sale_id}`);
    revalidatePath("/products");
    revalidatePath("/movements");
    revalidatePath("/dashboard");
    return success(data as { status: string });
  });
}
