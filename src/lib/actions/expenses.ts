"use server";

import { revalidatePath } from "next/cache";
import { expenseSchema } from "@/lib/schemas";
import { success, failure, withOwner, type ActionResult } from "./helpers";

/**
 * Operating-expense mutations.
 *
 * Expenses are separate from inventory purchases by design: buying stock is
 * investment/cash-outflow and becomes COGS only when sold, whereas these are
 * period costs that hit net profit on their expense_date.
 */

export async function createExpense(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = expenseSchema.safeParse(raw);
  if (!parsed.success) return failure(parsed.error);

  return withOwner(async ({ userId, supabase }) => {
    const v = parsed.data;
    const { data, error } = await supabase
      .from("expenses")
      .insert({
        user_id: userId,
        title: v.title,
        amount: v.amount,
        expense_date: v.expense_date,
        expense_category_id: v.expense_category_id ?? null,
        payment_method: v.payment_method,
        reference_number: v.reference_number ?? null,
        receipt_url: v.receipt_url ?? null,
        notes: v.notes ?? null,
      })
      .select("id")
      .single();

    if (error) return failure(error);
    revalidatePath("/expenses");
    revalidatePath("/dashboard");
    revalidatePath("/reports/pl");
    return success({ id: data.id });
  });
}

export async function updateExpense(
  expenseId: string,
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = expenseSchema.safeParse(raw);
  if (!parsed.success) return failure(parsed.error);

  return withOwner(async ({ userId, supabase }) => {
    const v = parsed.data;
    const { error } = await supabase
      .from("expenses")
      .update({
        title: v.title,
        amount: v.amount,
        expense_date: v.expense_date,
        expense_category_id: v.expense_category_id ?? null,
        payment_method: v.payment_method,
        reference_number: v.reference_number ?? null,
        receipt_url: v.receipt_url ?? null,
        notes: v.notes ?? null,
      })
      .eq("id", expenseId)
      .eq("user_id", userId);

    if (error) return failure(error);
    revalidatePath("/expenses");
    revalidatePath("/dashboard");
    revalidatePath("/reports/pl");
    return success({ id: expenseId });
  });
}

export async function deleteExpense(expenseId: string): Promise<ActionResult<void>> {
  return withOwner(async ({ userId, supabase }) => {
    // Expenses are not part of the immutable financial ledger of sales, so a
    // genuine mistaken entry can be removed outright.
    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", expenseId)
      .eq("user_id", userId);

    if (error) return failure(error);
    revalidatePath("/expenses");
    revalidatePath("/dashboard");
    revalidatePath("/reports/pl");
    return success(undefined);
  });
}

export async function createExpenseCategory(
  name: string,
  color: string,
): Promise<ActionResult<{ id: string }>> {
  return withOwner(async ({ userId, supabase }) => {
    const { data, error } = await supabase
      .from("expense_categories")
      .insert({ user_id: userId, name: name.trim(), color })
      .select("id")
      .single();
    if (error) return failure(error);
    revalidatePath("/expenses");
    return success({ id: data.id });
  });
}
