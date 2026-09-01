"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { createSupplier } from "@/lib/actions/purchases";
import { supplierSchema, type SupplierValues } from "@/lib/schemas";

export interface SupplierOption {
  id: string;
  name: string;
}

/** Pick an existing supplier or create one inline without leaving the flow. */
export function SupplierPicker({
  suppliers: initialSuppliers,
  value,
  onChange,
}: {
  suppliers: SupplierOption[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [suppliers, setSuppliers] = React.useState(initialSuppliers);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const form = useForm<SupplierValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: "", phone: "", email: "", address: "", notes: "" },
  });

  async function onSubmit(values: SupplierValues) {
    const result = await createSupplier(values);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    const created = { id: result.data.id, name: values.name };
    setSuppliers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    onChange(created.id);
    toast.success("Supplier added");
    setDialogOpen(false);
    form.reset();
  }

  return (
    <>
      <div className="flex gap-2">
        <Select value={value ?? "none"} onValueChange={(v) => onChange(v === "none" ? null : v)}>
          <SelectTrigger className="flex-1" aria-label="Supplier">
            <SelectValue placeholder="Choose a supplier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No supplier</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" onClick={() => setDialogOpen(true)}>
          <Plus aria-hidden />
          New
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New supplier</DialogTitle>
            <DialogDescription>Add someone you buy stock from.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Metro Cosmetics Wholesale" autoFocus />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} inputMode="tel" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} type="email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value ?? ""} rows={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={form.formState.isSubmitting}>
                  <Check aria-hidden />
                  Add supplier
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
