import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { RecordPurchaseForm } from "@/components/purchase/record-purchase-form";
import { createClient } from "@/lib/supabase/server";
import { getShopContext } from "@/lib/supabase/queries";
import type { SupplierRow } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Record purchase" };
export const dynamic = "force-dynamic";

export default async function NewPurchasePage() {
  const supabase = await createClient();
  const shop = await getShopContext();
  const { data } = await supabase.from("suppliers").select("id, name").order("name");
  const suppliers = (data ?? []) as Pick<SupplierRow, "id" | "name">[];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Purchases"
        title="Record a purchase"
        description="Add the stock you bought. Each product becomes a cost layer for accurate FIFO profit."
        backHref="/purchases"
        backLabel="Purchases"
      />
      <RecordPurchaseForm suppliers={suppliers} today={shop.today} />
    </div>
  );
}
