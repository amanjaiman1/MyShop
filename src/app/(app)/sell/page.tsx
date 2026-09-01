import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { SellWorkspace } from "@/components/sell/sell-workspace";

export const metadata: Metadata = { title: "Scan & Sell" };

export default function SellPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Point of sale"
        title="Scan & Sell"
        description="Build an order, see the profit on every line, and complete the sale with confidence."
      />
      <SellWorkspace />
    </div>
  );
}
