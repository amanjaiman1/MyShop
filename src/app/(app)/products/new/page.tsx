import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { ProductForm } from "@/components/product/product-form";
import { createClient } from "@/lib/supabase/server";
import type { CategoryRow } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "New product" };
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("id, name").order("name");
  const categories = (data ?? []) as Pick<CategoryRow, "id" | "name">[];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalogue"
        title="New product"
        description="Create a product for a single shade or size. You'll set its cost when you record a purchase."
        backHref="/products"
        backLabel="Products"
      />
      <ProductForm categories={categories} />
    </div>
  );
}
