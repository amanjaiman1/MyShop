/**
 * Database types for the Aurelia schema.
 *
 * Shape matches `supabase gen types typescript` so it can be regenerated with
 * `npm run db:types` once a local Supabase instance is linked. Kept in the repo
 * so the project type-checks without a live database.
 *
 * Every monetary field is a NUMBER OF MINOR CURRENCY UNITS (paise for INR).
 */

export type SaleStatus =
  | "draft"
  | "completed"
  | "partially_returned"
  | "returned"
  | "voided";

export type StockMovementType =
  | "purchase"
  | "sale"
  | "sale_return"
  | "purchase_return"
  | "damaged"
  | "expired"
  | "manual_adjustment";

export type MovementReferenceType = "purchase_batch" | "sale" | "adjustment";

export type PaymentMethod =
  | "cash"
  | "upi"
  | "card"
  | "bank_transfer"
  | "wallet"
  | "credit"
  | "other";

export type BelowCostBehavior = "allow" | "warn" | "block";

/** PROFIT / LOW PROFIT / BREAK-EVEN / LOSS, as decided by `public.price_status`. */
export type PriceStatus = "profit" | "low_profit" | "breakeven" | "loss" | "unknown";

export type NetStatus = "net_profit" | "breakeven" | "net_loss";

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export type ReportPeriodKey =
  | "today"
  | "yesterday"
  | "last_5_days"
  | "last_10_days"
  | "last_20_days"
  | "last_30_days"
  | "this_month"
  | "last_month"
  | "this_year"
  | "all_time"
  | "custom";

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type ProfileRow = {
  id: string;
  display_name: string;
  shop_name: string;
  phone: string | null;
  currency_code: string;
  currency_symbol: string;
  timezone: string;
  target_profit_margin: number;
  low_margin_threshold: number;
  below_cost_sale_behavior: BelowCostBehavior;
  app_started_at: string;
  created_at: string;
  updated_at: string;
}

export type CategoryRow = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export type SupplierRow = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ProductRow = {
  id: string;
  user_id: string;
  category_id: string | null;
  sku: string | null;
  manufacturer_barcode: string | null;
  internal_code: string;
  name: string;
  brand: string | null;
  shade_or_variant: string | null;
  size: string | null;
  description: string | null;
  image_url: string | null;
  recommended_selling_price: number;
  minimum_selling_price: number;
  low_stock_threshold: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  search_document: string;
}

export type ProductPriceHistoryRow = {
  id: string;
  user_id: string;
  product_id: string;
  previous_selling_price: number | null;
  new_selling_price: number | null;
  previous_minimum_price: number | null;
  new_minimum_price: number | null;
  changed_at: string;
}

export type PurchaseBatchRow = {
  id: string;
  user_id: string;
  product_id: string;
  supplier_id: string | null;
  quantity_purchased: number;
  quantity_remaining: number;
  unit_cost: number;
  purchase_date: string;
  lot_number: string | null;
  expiry_date: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type SaleRow = {
  id: string;
  user_id: string;
  invoice_number: string;
  status: SaleStatus;
  sale_date: string;
  subtotal: number;
  discount: number;
  return_amount: number;
  total: number;
  total_cost: number;
  gross_profit: number;
  payment_method: PaymentMethod;
  notes: string | null;
  client_request_id: string | null;
  created_at: string;
  updated_at: string;
}

export type SaleItemRow = {
  id: string;
  user_id: string;
  sale_id: string;
  product_id: string;
  purchase_batch_id: string | null;
  quantity: number;
  quantity_returned: number;
  unit_cost_snapshot: number;
  unit_selling_price: number;
  line_discount: number;
  line_total: number;
  line_profit: number;
  created_at: string;
}

export type StockMovementRow = {
  id: string;
  user_id: string;
  product_id: string;
  purchase_batch_id: string | null;
  movement_type: StockMovementType;
  quantity: number;
  reference_type: MovementReferenceType | null;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
}

export type ExpenseCategoryRow = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export type ExpenseRow = {
  id: string;
  user_id: string;
  expense_category_id: string | null;
  title: string;
  amount: number;
  expense_date: string;
  payment_method: PaymentMethod;
  reference_number: string | null;
  /** Storage object path inside the private `receipts` bucket. */
  receipt_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export type ProductInventoryRow = {
  product_id: string;
  user_id: string;
  quantity_on_hand: number;
  inventory_cost: number;
  open_batch_count: number;
  average_unit_cost: number | null;
  fifo_unit_cost: number | null;
  latest_unit_cost: number | null;
  max_open_batch_cost: number | null;
  nearest_expiry: string | null;
  last_purchase_date: string | null;
}

export type ProductOverviewRow = {
  id: string;
  user_id: string;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  sku: string | null;
  manufacturer_barcode: string | null;
  internal_code: string;
  name: string;
  brand: string | null;
  shade_or_variant: string | null;
  size: string | null;
  description: string | null;
  image_url: string | null;
  recommended_selling_price: number;
  minimum_selling_price: number;
  low_stock_threshold: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  quantity_on_hand: number;
  inventory_cost: number;
  open_batch_count: number;
  average_unit_cost: number | null;
  fifo_unit_cost: number | null;
  latest_unit_cost: number | null;
  max_open_batch_cost: number | null;
  nearest_expiry: string | null;
  last_purchase_date: string | null;
  expected_unit_profit: number;
  expected_margin_pct: number;
  expected_markup_pct: number;
  projected_revenue: number;
  projected_gross_profit: number;
  stock_status: StockStatus;
  price_status: PriceStatus;
  has_batch_below_price: boolean;
}

export type SaleItemFinancialsRow = {
  id: string;
  user_id: string;
  sale_id: string;
  product_id: string;
  purchase_batch_id: string | null;
  quantity: number;
  quantity_returned: number;
  quantity_retained: number;
  unit_cost_snapshot: number;
  unit_selling_price: number;
  line_discount: number;
  original_line_total: number;
  original_line_profit: number;
  created_at: string;
  net_revenue: number;
  returned_revenue: number;
  net_cost: number;
  net_profit: number;
}

// ---------------------------------------------------------------------------
// RPC payloads
// ---------------------------------------------------------------------------

export type PurchaseLineInput = {
  product_id: string;
  quantity: number;
  unit_cost: number;
  lot_number?: string | null;
  expiry_date?: string | null;
}

export type RecordPurchaseResult = {
  reference_number: string;
  purchase_date: string;
  batch_ids: string[];
  total_units: number;
  total_investment: number;
}

export type SaleLineInput = {
  product_id: string;
  quantity: number;
  unit_selling_price: number;
  line_discount?: number;
}

export type CompleteSaleResult = {
  sale_id: string;
  invoice_number: string;
  duplicate: boolean;
  subtotal?: number;
  discount?: number;
  total?: number;
  total_cost?: number;
  gross_profit?: number;
  margin_pct?: number;
  status?: PriceStatus;
}

export type PreviewSaleLine = {
  line_no: number;
  product_id: string;
  quantity: number;
  allocated_qty: number;
  unit_selling_price: number;
  line_cost: number;
  fifo_unit_cost: number | null;
  min_batch_cost: number | null;
  max_batch_cost: number | null;
  line_profit: number;
  margin_pct: number;
  markup_pct: number;
  status: PriceStatus;
  below_some_batch: boolean;
  insufficient_stock: boolean;
  allocations: Array<{ batch_id: string; quantity: number; unit_cost: number }>;
}

export type PreviewSaleResult = {
  lines: PreviewSaleLine[];
  subtotal: number;
  total_cost: number;
  gross_profit: number;
}

export type PeriodRow = {
  period_start: string;
  period_end: string;
  label: string;
}

export type ReportBoundsRow = {
  earliest_date: string;
  latest_date: string;
  app_started_on: string;
}

export type PlSummaryRow = {
  period_start: string;
  period_end: string;
  period_label: string;
  gross_sales: number;
  discounts: number;
  returns_amount: number;
  net_sales: number;
  cost_of_goods_sold: number;
  realized_gross_profit: number;
  gross_margin_pct: number;
  operating_expenses: number;
  net_profit: number;
  net_margin_pct: number;
  order_count: number;
  units_sold: number;
  average_order_value: number;
  inventory_purchased: number;
  inventory_units_purchased: number;
  current_inventory_investment: number;
  projected_gross_profit: number;
  loss_making_order_count: number;
  status: NetStatus;
}

export type DailySeriesRow = {
  day: string;
  gross_sales: number;
  discounts: number;
  returns_amount: number;
  net_sales: number;
  cost_of_goods_sold: number;
  realized_gross_profit: number;
  operating_expenses: number;
  net_profit: number;
  order_count: number;
  units_sold: number;
}

export type MonthlySeriesRow = {
  month: string;
  gross_sales: number;
  discounts: number;
  returns_amount: number;
  net_sales: number;
  cost_of_goods_sold: number;
  realized_gross_profit: number;
  operating_expenses: number;
  net_profit: number;
  gross_margin_pct: number;
  net_margin_pct: number;
  order_count: number;
  units_sold: number;
  inventory_purchased: number;
}

export type YearlySeriesRow = Omit<MonthlySeriesRow, "month"> & {
  year: number;
};

export type ProductProfitabilityRow = {
  product_id: string;
  name: string;
  brand: string | null;
  shade_or_variant: string | null;
  internal_code: string;
  image_url: string | null;
  category_name: string | null;
  units_sold: number;
  net_revenue: number;
  net_cost: number;
  net_profit: number;
  margin_pct: number;
  order_count: number;
}

export type PaymentMethodReportRow = {
  payment_method: PaymentMethod;
  order_count: number;
  net_sales: number;
  gross_profit: number;
}

export type ExpenseCategoryReportRow = {
  expense_category_id: string | null;
  name: string;
  color: string;
  total_amount: number;
  entry_count: number;
  share_pct: number;
}

export type LossMakingSaleRow = {
  sale_id: string;
  invoice_number: string;
  sale_date: string;
  status: SaleStatus;
  net_sales: number;
  total_cost: number;
  gross_profit: number;
  margin_pct: number;
  item_count: number;
}

export type ProjectedByCategoryRow = {
  category_id: string | null;
  name: string;
  color: string;
  product_count: number;
  quantity_on_hand: number;
  inventory_investment: number;
  projected_revenue: number;
  projected_gross_profit: number;
  projected_margin_pct: number;
}

export type DashboardSnapshot = {
  today: PlSummaryRow;
  yesterday: PlSummaryRow;
  this_month: PlSummaryRow;
  comparison: {
    net_sales_delta: number;
    gross_profit_delta: number;
    net_profit_delta: number;
    /** Null when the baseline was zero — never Infinity. */
    net_sales_pct: number | null;
    gross_profit_pct: number | null;
    net_profit_pct: number | null;
  };
  inventory: {
    investment: number;
    units: number;
    projected_revenue: number;
    projected_gross_profit: number;
    projected_margin_pct: number;
  };
  alerts: {
    low_stock: number;
    out_of_stock: number;
    expiring_soon: number;
    priced_at_loss: number;
    priced_at_breakeven: number;
  };
}

export type ShopContextRow = {
  today: string;
  timezone: string;
  now_local: string;
}

// ---------------------------------------------------------------------------
// Supabase `Database` generic
// ---------------------------------------------------------------------------

type Insertable<T, Optional extends keyof T> = Omit<T, Optional> &
  Partial<Pick<T, Optional>>;

type Timestamps = "created_at" | "updated_at";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Insertable<ProfileRow, Exclude<keyof ProfileRow, "id">>;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      categories: {
        Row: CategoryRow;
        Insert: Insertable<CategoryRow, "id" | "color" | Timestamps>;
        Update: Partial<CategoryRow>;
        Relationships: [];
      };
      suppliers: {
        Row: SupplierRow;
        Insert: Insertable<
          SupplierRow,
          "id" | "phone" | "email" | "address" | "notes" | Timestamps
        >;
        Update: Partial<SupplierRow>;
        Relationships: [];
      };
      products: {
        Row: ProductRow;
        Insert: Insertable<
          Omit<ProductRow, "search_document">,
          | "id"
          | "category_id"
          | "sku"
          | "manufacturer_barcode"
          | "internal_code"
          | "brand"
          | "shade_or_variant"
          | "size"
          | "description"
          | "image_url"
          | "recommended_selling_price"
          | "minimum_selling_price"
          | "low_stock_threshold"
          | "is_active"
          | Timestamps
        >;
        Update: Partial<Omit<ProductRow, "search_document">>;
        Relationships: [];
      };
      product_price_history: {
        Row: ProductPriceHistoryRow;
        Insert: Partial<ProductPriceHistoryRow>;
        Update: Partial<ProductPriceHistoryRow>;
        Relationships: [];
      };
      purchase_batches: {
        Row: PurchaseBatchRow;
        Insert: Partial<PurchaseBatchRow>;
        Update: Partial<PurchaseBatchRow>;
        Relationships: [];
      };
      sales: {
        Row: SaleRow;
        Insert: Partial<SaleRow>;
        Update: Partial<SaleRow>;
        Relationships: [];
      };
      sale_items: {
        Row: SaleItemRow;
        Insert: Partial<SaleItemRow>;
        Update: Partial<SaleItemRow>;
        Relationships: [];
      };
      stock_movements: {
        Row: StockMovementRow;
        Insert: Partial<StockMovementRow>;
        Update: Partial<StockMovementRow>;
        Relationships: [];
      };
      expense_categories: {
        Row: ExpenseCategoryRow;
        Insert: Insertable<ExpenseCategoryRow, "id" | "color" | Timestamps>;
        Update: Partial<ExpenseCategoryRow>;
        Relationships: [];
      };
      expenses: {
        Row: ExpenseRow;
        Insert: Insertable<
          ExpenseRow,
          | "id"
          | "expense_category_id"
          | "expense_date"
          | "payment_method"
          | "reference_number"
          | "receipt_url"
          | "notes"
          | Timestamps
        >;
        Update: Partial<ExpenseRow>;
        Relationships: [];
      };
    };
    Views: {
      product_inventory: { Row: ProductInventoryRow; Relationships: [] };
      product_overview: { Row: ProductOverviewRow; Relationships: [] };
      sale_item_financials: { Row: SaleItemFinancialsRow; Relationships: [] };
    };
    Functions: {
      shop_context: { Args: Record<string, never>; Returns: ShopContextRow[] };
      ensure_owner_setup: { Args: Record<string, never>; Returns: ProfileRow };
      owner_exists: { Args: Record<string, never>; Returns: boolean };
      record_purchase: {
        Args: {
          p_lines: PurchaseLineInput[];
          p_supplier_id?: string | null;
          p_purchase_date?: string | null;
          p_reference_number?: string | null;
          p_notes?: string | null;
        };
        Returns: RecordPurchaseResult;
      };
      adjust_stock: {
        Args: {
          p_product_id: string;
          p_movement_type: StockMovementType;
          p_quantity: number;
          p_reason: string;
          p_batch_id?: string | null;
        };
        Returns: { adjusted: number; batch_id?: string };
      };
      complete_sale: {
        Args: {
          p_items: SaleLineInput[];
          p_payment_method?: PaymentMethod;
          p_order_discount?: number;
          p_notes?: string | null;
          p_client_request_id?: string | null;
          p_sale_date?: string | null;
          p_confirm_loss?: boolean;
          p_confirm_breakeven?: boolean;
        };
        Returns: CompleteSaleResult;
      };
      preview_sale: {
        Args: { p_items: SaleLineInput[] };
        Returns: PreviewSaleResult;
      };
      return_sale_items: {
        Args: {
          p_sale_id: string;
          p_lines: Array<{ sale_item_id: string; quantity: number }>;
          p_reason: string;
        };
        Returns: { sale_id: string; return_amount: number; status: SaleStatus };
      };
      void_sale: {
        Args: { p_sale_id: string; p_reason: string };
        Returns: { sale_id: string; status: SaleStatus; already: boolean };
      };
      report_period: {
        Args: { p_period: ReportPeriodKey; p_start?: string | null; p_end?: string | null };
        Returns: PeriodRow[];
      };
      report_bounds: { Args: Record<string, never>; Returns: ReportBoundsRow[] };
      report_pl_summary: {
        Args: { p_period: ReportPeriodKey; p_start?: string | null; p_end?: string | null };
        Returns: PlSummaryRow[];
      };
      report_daily_series: {
        Args: { p_period: ReportPeriodKey; p_start?: string | null; p_end?: string | null };
        Returns: DailySeriesRow[];
      };
      report_monthly_series: {
        Args: { p_from?: string | null; p_to?: string | null };
        Returns: MonthlySeriesRow[];
      };
      report_yearly_series: { Args: Record<string, never>; Returns: YearlySeriesRow[] };
      report_product_profitability: {
        Args: { p_period: ReportPeriodKey; p_start?: string | null; p_end?: string | null };
        Returns: ProductProfitabilityRow[];
      };
      report_payment_methods: {
        Args: { p_period: ReportPeriodKey; p_start?: string | null; p_end?: string | null };
        Returns: PaymentMethodReportRow[];
      };
      report_expenses_by_category: {
        Args: { p_period: ReportPeriodKey; p_start?: string | null; p_end?: string | null };
        Returns: ExpenseCategoryReportRow[];
      };
      report_loss_making_sales: {
        Args: { p_period: ReportPeriodKey; p_start?: string | null; p_end?: string | null };
        Returns: LossMakingSaleRow[];
      };
      report_projected_by_category: {
        Args: Record<string, never>;
        Returns: ProjectedByCategoryRow[];
      };
      dashboard_snapshot: { Args: Record<string, never>; Returns: DashboardSnapshot };
      price_status: {
        Args: { p_price: number; p_cost: number; p_low_margin?: number };
        Returns: PriceStatus;
      };
    };
    Enums: {
      sale_status: SaleStatus;
      stock_movement_type: StockMovementType;
      movement_reference_type: MovementReferenceType;
      payment_method: PaymentMethod;
      below_cost_behavior: BelowCostBehavior;
    };
    CompositeTypes: Record<string, never>;
  };
}
