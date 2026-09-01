"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ExpenseDialog } from "./expense-dialog";
import { deleteExpense } from "@/lib/actions/expenses";
import type { ExpenseCategoryRow, ExpenseRow } from "@/lib/supabase/database.types";

export function ExpenseRowActions({
  expense,
  categories,
}: {
  expense: ExpenseRow;
  categories: Pick<ExpenseCategoryRow, "id" | "name">[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function remove() {
    setBusy(true);
    try {
      const result = await deleteExpense(expense.id);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Expense deleted");
      setDeleteOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="iconSm" aria-label="Expense actions">
            <MoreVertical className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setEditOpen(true); }}>
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem tone="danger" onSelect={(e) => { e.preventDefault(); setDeleteOpen(true); }}>
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit dialog is controlled here so it can be opened from the menu. */}
      {editOpen ? (
        <ControlledEditDialog
          expense={expense}
          categories={categories}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      ) : null}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              “{expense.title}” will be removed from your records and your profit reports. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void remove()} disabled={busy}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * ExpenseDialog manages its own trigger + open state; to open it from a menu we
 * render it with a hidden trigger and drive `open` via a tiny wrapper that
 * clicks the trigger once on mount.
 */
function ControlledEditDialog({
  expense,
  categories,
  onOpenChange,
}: {
  expense: ExpenseRow;
  categories: Pick<ExpenseCategoryRow, "id" | "name">[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    ref.current?.click();
  }, []);
  return (
    <ExpenseDialog
      expense={expense}
      categories={categories}
      trigger={
        <button ref={ref} type="button" className="hidden" aria-hidden onClick={() => onOpenChange(true)} />
      }
    />
  );
}
