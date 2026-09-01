import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { ProductForm } from "@/components/product/product-form";
import { createClient } from "@/lib/supabase/server";
import type { CategoryRow, ProductOverviewRow } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Edit product" };
export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: product }, { data: categoriesRaw }] = await Promise.all([
    supabase.from("product_overview").select("*").eq("id", id).maybeSingle(),
    supabase.from("categories").select("id, name").order("name"),
  ]);

  if (!product) notFound();
  const categories = (categoriesRaw ?? []) as Pick<CategoryRow, "id" | "name">[];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalogue"
        title={`Edit ${(product as ProductOverviewRow).name}`}
        backHref={`/products/${id}`}
        backLabel="Back to product"
      />
      <ProductForm categories={categories} product={product as ProductOverviewRow} />
    </div>
  );
}
