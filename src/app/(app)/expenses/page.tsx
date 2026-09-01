import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Money } from "@/components/common/money";
import { StatCard } from "@/components/common/stat-card";
import { ExportButton } from "@/components/common/export-button";
import { ExpenseDialog } from "@/components/expense/expense-dialog";
import { ExpenseRowActions } from "@/components/expense/expense-row-actions";
import { PeriodPicker } from "@/components/reports/period-picker";
import { CategoryDonut } from "@/components/charts/chart-kit";
import {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getShopContext } from "@/lib/supabase/queries";
import { formatDate, formatPercent } from "@/lib/format";
import { csvMoney } from "@/lib/csv";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type {
  ExpenseCategoryReportRow,
  ExpenseCategoryRow,
  ExpenseRow,
  PeriodRow,
  ReportPeriodKey,
} from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Expenses" };
export const dynamic = "force-dynamic";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>;
}) {
  const sp = await searchParams;
  const period = (sp.period ?? "this_month") as ReportPeriodKey;
  const start = sp.start ?? null;
  const end = sp.end ?? null;

  const supabase = await createClient();
  const shop = await getShopContext();

  // Resolve the period to concrete dates (shop timezone) for the list query.
  const { data: periodRows } = await supabase.rpc("report_period", {
    p_period: period,
    p_start: start,
    p_end: end,
  });
  const resolved = ((periodRows ?? [])[0] ?? {
    period_start: shop.today,
    period_end: shop.today,
    label: "Today",
  }) as PeriodRow;

  const [{ data: expensesRaw }, { data: breakdownRaw }, { data: categoriesRaw }] =
    await Promise.all([
      supabase
        .from("expenses")
        .select(
          "id, title, amount, expense_date, payment_method, reference_number, notes, expense_category_id, expense_categories(name, color)",
        )
        .gte("expense_date", resolved.period_start)
        .lte("expense_date", resolved.period_end)
        .order("expense_date", { ascending: false }),
      supabase.rpc("report_expenses_by_category", {
        p_period: period,
        p_start: start,
        p_end: end,
      }),
      supabase.from("expense_categories").select("id, name").order("name"),
    ]);

  type Row = ExpenseRow & { expense_categories: { name: string; color: string } | null };
  const expenses = (expensesRaw ?? []) as unknown as Row[];
  const breakdown = (breakdownRaw ?? []) as ExpenseCategoryReportRow[];
  const categories = (categoriesRaw ?? []) as Pick<ExpenseCategoryRow, "id" | "name">[];

  const total = expenses.reduce((a, e) => a + e.amount, 0);

  const exportRows = expenses.map((e) => ({
    date: e.expense_date,
    title: e.title,
    category: e.expense_categories?.name ?? "Uncategorised",
    amount: csvMoney(e.amount),
    payment_method: PAYMENT_METHOD_LABELS[e.payment_method],
    reference: e.reference_number ?? "",
    notes: e.notes ?? "",
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Money"
        title="Expenses"
        description="Your running costs. These reduce net profit — buying stock does not (that's a purchase)."
        actions={<ExpenseDialog categories={categories} />}
      />

      <PeriodPicker today={shop.today} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <StatCard
            label={resolved.label}
            value={<Money value={total} size="xl" />}
            icon={Wallet}
            tone="primary"
            hint={`${expenses.length} ${expenses.length === 1 ? "entry" : "entries"}`}
            emphasis
          />
          {breakdown.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>By category</CardTitle>
              </CardHeader>
              <CardContent>
                <CategoryDonut
                  data={breakdown.map((b) => ({ name: b.name, value: b.total_amount, color: b.color }))}
                />
                <ul className="mt-3 space-y-1.5">
                  {breakdown.map((b) => (
                    <li key={b.expense_category_id ?? b.name} className="flex items-center gap-2 text-sm">
                      <span className="size-2.5 rounded-full" style={{ background: b.color }} aria-hidden />
                      <span className="flex-1 truncate text-muted">{b.name}</span>
                      <span className="tnum text-xs text-subtle">{formatPercent(b.share_pct)}</span>
                      <Money value={b.total_amount} size="sm" className="font-medium" />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Expense entries</CardTitle>
              <ExportButton
                rows={exportRows}
                columns={[
                  { header: "Date", key: "date" },
                  { header: "Title", key: "title" },
                  { header: "Category", key: "category" },
                  { header: "Amount", key: "amount" },
                  { header: "Payment", key: "payment_method" },
                  { header: "Reference", key: "reference" },
                  { header: "Notes", key: "notes" },
                ]}
                kind="expenses"
              />
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {expenses.length === 0 ? (
              <div className="px-6 pb-6">
                <EmptyState
                  compact
                  icon={Wallet}
                  title="No expenses in this period"
                  description="Record rent, delivery, packaging and other running costs to see your true net profit."
                  action={<ExpenseDialog categories={categories} />}
                />
              </div>
            ) : (
              <TableWrapper className="rounded-none border-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Expense</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead numeric>Amount</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>
                          <span className="font-medium text-ink">{e.title}</span>
                          <p className="text-xs text-subtle">
                            {PAYMENT_METHOD_LABELS[e.payment_method]}
                          </p>
                        </TableCell>
                        <TableCell>
                          {e.expense_categories ? (
                            <Badge
                              variant="neutral"
                              size="sm"
                              style={{
                                borderColor: `${e.expense_categories.color}55`,
                                color: e.expense_categories.color,
                              }}
                            >
                              {e.expense_categories.name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-subtle">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted">{formatDate(e.expense_date)}</span>
                        </TableCell>
                        <TableCell numeric>
                          <Money value={e.amount} className="font-medium" />
                        </TableCell>
                        <TableCell className="w-10">
                          <ExpenseRowActions
                            expense={e as ExpenseRow}
                            categories={categories}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrapper>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
