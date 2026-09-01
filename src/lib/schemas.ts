import { z } from "zod";
import { parseMoneyInput } from "./money";

/**
 * Validation shared by the browser form and the Server Action.
 *
 * The same schema runs in both places: the client gets instant feedback, and the
 * server re-validates because client validation is a convenience, never a
 * control. Money fields arrive as the text the owner typed and are coerced to
 * integer minor units here, at the boundary.
 */

/** A money field: accepts "1,249.50" / "₹250" / 24950, yields minor units. */
const moneyField = (label: string, { min = 0, required = true } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((value, ctx) => {
      const parsed = parseMoneyInput(value);
      if (parsed === null) {
        if (!required) return 0;
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is required.` });
        return z.NEVER;
      }
      if (parsed < min) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} cannot be less than ${min / 100}.`,
        });
        return z.NEVER;
      }
      return parsed;
    });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Please keep this under ${max} characters.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const uuidField = z.string().uuid("That selection is not valid.");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD form.");

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Enter your email.").email("That does not look like an email."),
  password: z.string().min(1, "Enter your password."),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, "Enter your email.").email("That does not look like an email."),
});
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(10, "Use at least 10 characters.")
      .max(72, "Passwords cannot be longer than 72 characters.")
      .regex(/[a-z]/, "Include a lower-case letter.")
      .regex(/[A-Z]/, "Include an upper-case letter.")
      .regex(/[0-9]/, "Include a number."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Both passwords must match.",
    path: ["confirm"],
  });
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export const productSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Give the product a name.")
      .max(200, "That name is too long."),
    brand: optionalText(120),
    shade_or_variant: optionalText(120),
    size: optionalText(60),
    category_id: uuidField.nullable().optional(),
    sku: optionalText(64),
    manufacturer_barcode: optionalText(64),
    description: optionalText(2000),
    image_url: z.string().url("That is not a valid image URL.").nullable().optional(),
    recommended_selling_price: moneyField("Recommended selling price"),
    minimum_selling_price: moneyField("Minimum selling price"),
    low_stock_threshold: z.coerce
      .number()
      .int("Use a whole number.")
      .min(0, "This cannot be negative.")
      .max(100000, "That threshold is unrealistically high."),
    is_active: z.boolean().default(true),
  })
  .refine((v) => v.minimum_selling_price <= v.recommended_selling_price, {
    message: "Your minimum price cannot be above your recommended price.",
    path: ["minimum_selling_price"],
  });
export type ProductValues = z.infer<typeof productSchema>;

/** Selling-price update from the price simulator's "Save selling price". */
export const savePriceSchema = z
  .object({
    product_id: uuidField,
    recommended_selling_price: moneyField("Selling price"),
    minimum_selling_price: moneyField("Minimum price"),
    /** Set once the owner has acknowledged a loss-making or break-even price. */
    confirm_unprofitable: z.boolean().default(false),
  })
  .refine((v) => v.minimum_selling_price <= v.recommended_selling_price, {
    message: "Your minimum price cannot be above your selling price.",
    path: ["minimum_selling_price"],
  });
export type SavePriceValues = z.infer<typeof savePriceSchema>;

// ---------------------------------------------------------------------------
// Category / Supplier
// ---------------------------------------------------------------------------

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name the category.").max(80, "That name is too long."),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Pick a colour.")
    .default("#9E1F47"),
});
export type CategoryValues = z.infer<typeof categorySchema>;

export const supplierSchema = z.object({
  name: z.string().trim().min(2, "Name the supplier.").max(160, "That name is too long."),
  phone: optionalText(32),
  email: z
    .union([z.string().trim().email("That does not look like an email."), z.literal("")])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  address: optionalText(500),
  notes: optionalText(1000),
});
export type SupplierValues = z.infer<typeof supplierSchema>;

// ---------------------------------------------------------------------------
// Purchase
// ---------------------------------------------------------------------------

export const purchaseLineSchema = z.object({
  product_id: uuidField,
  quantity: z.coerce
    .number()
    .int("Use whole units.")
    .min(1, "Quantity must be at least 1.")
    .max(1_000_000, "That quantity is unrealistically high."),
  unit_cost: moneyField("Unit purchase cost"),
  lot_number: optionalText(64),
  expiry_date: z.union([isoDate, z.literal("")]).transform((v) => (v === "" ? null : v)).nullable().optional(),
});
export type PurchaseLineValues = z.infer<typeof purchaseLineSchema>;

export const purchaseSchema = z.object({
  supplier_id: uuidField.nullable().optional(),
  purchase_date: isoDate,
  reference_number: optionalText(64),
  notes: optionalText(1000),
  lines: z.array(purchaseLineSchema).min(1, "Add at least one product to the purchase."),
});
export type PurchaseValues = z.infer<typeof purchaseSchema>;

// ---------------------------------------------------------------------------
// Sale / checkout
// ---------------------------------------------------------------------------

export const saleLineSchema = z.object({
  product_id: uuidField,
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1."),
  unit_selling_price: moneyField("Selling price"),
  line_discount: moneyField("Line discount", { required: false }),
});

export const checkoutSchema = z.object({
  items: z.array(saleLineSchema).min(1, "Add at least one product before completing the sale."),
  order_discount: moneyField("Order discount", { required: false }),
  payment_method: z.enum([
    "cash",
    "upi",
    "card",
    "bank_transfer",
    "wallet",
    "credit",
    "other",
  ]),
  notes: optionalText(1000),
  client_request_id: uuidField,
  confirm_loss: z.boolean().default(false),
  confirm_breakeven: z.boolean().default(false),
});
export type CheckoutValues = z.infer<typeof checkoutSchema>;

export const returnSchema = z.object({
  sale_id: uuidField,
  reason: z.string().trim().min(3, "Say why this is being returned.").max(500),
  lines: z
    .array(
      z.object({
        sale_item_id: uuidField,
        quantity: z.coerce.number().int().min(1),
      }),
    )
    .min(1, "Choose at least one item to return."),
});
export type ReturnValues = z.infer<typeof returnSchema>;

export const voidSaleSchema = z.object({
  sale_id: uuidField,
  reason: z.string().trim().min(3, "Say why this sale is being voided.").max(500),
});
export type VoidSaleValues = z.infer<typeof voidSaleSchema>;

// ---------------------------------------------------------------------------
// Stock adjustment
// ---------------------------------------------------------------------------

export const stockAdjustmentSchema = z
  .object({
    product_id: uuidField,
    movement_type: z.enum(["damaged", "expired", "purchase_return", "manual_adjustment"]),
    direction: z.enum(["in", "out"]).default("out"),
    quantity: z.coerce
      .number()
      .int("Use whole units.")
      .min(1, "Enter how many units."),
    reason: z.string().trim().min(3, "A reason is required for every adjustment.").max(500),
    batch_id: uuidField.nullable().optional(),
  })
  .refine((v) => v.direction === "out" || v.movement_type === "manual_adjustment", {
    message: "Only a correction can add units back.",
    path: ["direction"],
  });
export type StockAdjustmentValues = z.infer<typeof stockAdjustmentSchema>;

// ---------------------------------------------------------------------------
// Expense
// ---------------------------------------------------------------------------

export const expenseSchema = z.object({
  title: z.string().trim().min(2, "What was this for?").max(200),
  amount: moneyField("Amount", { min: 1 }),
  expense_date: isoDate,
  expense_category_id: uuidField.nullable().optional(),
  payment_method: z.enum([
    "cash",
    "upi",
    "card",
    "bank_transfer",
    "wallet",
    "credit",
    "other",
  ]),
  reference_number: optionalText(64),
  receipt_url: optionalText(500),
  notes: optionalText(1000),
});
export type ExpenseValues = z.infer<typeof expenseSchema>;

export const expenseCategorySchema = categorySchema;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const settingsSchema = z
  .object({
    display_name: z.string().trim().min(1, "Enter your name.").max(120),
    shop_name: z.string().trim().min(1, "Name your shop.").max(160),
    phone: optionalText(32),
    currency_code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Use a three-letter code, like INR."),
    currency_symbol: z.string().trim().min(1, "Enter a symbol.").max(8),
    timezone: z.string().trim().min(1, "Choose your shop's timezone."),
    target_profit_margin: z.coerce
      .number()
      .min(0, "This cannot be negative.")
      .max(99.99, "Use a margin below 100%."),
    low_margin_threshold: z.coerce
      .number()
      .min(0, "This cannot be negative.")
      .max(99.99, "Use a threshold below 100%."),
    below_cost_sale_behavior: z.enum(["allow", "warn", "block"]),
  })
  .refine((v) => v.low_margin_threshold <= v.target_profit_margin, {
    message: "Your low-margin warning must be at or below your target margin.",
    path: ["low_margin_threshold"],
  });
export type SettingsValues = z.infer<typeof settingsSchema>;

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const customRangeSchema = z
  .object({
    start: isoDate,
    end: isoDate,
  })
  .refine((v) => v.start <= v.end, {
    message: "The start date must not be after the end date.",
    path: ["start"],
  });
export type CustomRangeValues = z.infer<typeof customRangeSchema>;

// ---------------------------------------------------------------------------
// Uploads — constrain before anything reaches Storage
// ---------------------------------------------------------------------------

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
export const ALLOWED_RECEIPT_TYPES = [...ALLOWED_IMAGE_TYPES.slice(0, 3), "application/pdf"];

export function validateUpload(
  file: { type: string; size: number },
  kind: "image" | "receipt",
): string | null {
  const allowed = kind === "image" ? ALLOWED_IMAGE_TYPES : ALLOWED_RECEIPT_TYPES;
  const maxBytes = kind === "image" ? MAX_IMAGE_BYTES : MAX_RECEIPT_BYTES;

  if (!allowed.includes(file.type)) {
    return kind === "image"
      ? "Use a JPEG, PNG, WebP or AVIF image."
      : "Use a JPEG, PNG, WebP image or a PDF.";
  }
  if (file.size > maxBytes) {
    return `Keep the file under ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  }
  return null;
}
