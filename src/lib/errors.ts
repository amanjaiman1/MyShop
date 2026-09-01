/**
 * Turning database errors into sentences a shop owner can act on.
 *
 * The financial RPCs raise deliberate SQLSTATEs (AU001–AU005) precisely so the
 * UI can tell "this needs your confirmation" apart from "this is impossible".
 */

export const SALE_ERROR = {
  /** A line or the whole order loses money. */
  CONFIRM_LOSS: "AU001",
  /** The order exactly breaks even. */
  CONFIRM_BREAKEVEN: "AU002",
  /** Below-cost selling is switched off in Settings. */
  BLOCKED_BELOW_COST: "AU003",
  /** Not enough stock. */
  INSUFFICIENT_STOCK: "AU004",
  /** Malformed or empty request. */
  INVALID_REQUEST: "AU005",
} as const;

export type SaleErrorCode = (typeof SALE_ERROR)[keyof typeof SALE_ERROR];

export interface AppError {
  code: string | null;
  message: string;
  /** True when the owner can retry after confirming. */
  needsConfirmation: boolean;
  confirmKind?: "loss" | "breakeven";
}

interface PostgrestLike {
  code?: string | null;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  products_user_internal_code_key: "That internal code is already used by another product.",
  products_user_sku_key: "Another product already uses that SKU.",
  products_user_barcode_key:
    "Another product already has that barcode. Scan it to find the existing product.",
  categories_user_name_key: "You already have a category with that name.",
  suppliers_user_name_key: "You already have a supplier with that name.",
  ec_user_name_key: "You already have an expense category with that name.",
  sales_user_invoice_key: "That invoice number already exists.",
  products_rsp_nonneg: "A selling price cannot be negative.",
  products_msp_nonneg: "A minimum price cannot be negative.",
  expenses_amount_positive: "An expense amount must be greater than zero.",
  pb_qty_purchased_positive: "Purchase quantity must be at least 1.",
  pb_qty_remaining_range: "That change would leave the batch with impossible stock.",
  profiles_timezone_valid: "That is not a recognised timezone.",
  profiles_margin_ordering:
    "Your low-margin threshold cannot be higher than your target margin.",
  profiles_currency_code_fmt: "A currency code must be three letters, like INR or USD.",
};

/**
 * Normalise anything thrown by Supabase / Postgres into a displayable error.
 * Unknown database failures are never surfaced verbatim — the raw text can leak
 * schema details and means nothing to the owner.
 */
export function toAppError(error: unknown): AppError {
  if (!error) return { code: null, message: "Something went wrong.", needsConfirmation: false };

  const e = error as PostgrestLike;
  const code = e.code ?? null;
  const raw = e.message ?? "";

  switch (code) {
    case SALE_ERROR.CONFIRM_LOSS:
      return {
        code,
        message: "This sale loses money. Confirm that you want to record it.",
        needsConfirmation: true,
        confirmKind: "loss",
      };
    case SALE_ERROR.CONFIRM_BREAKEVEN:
      return {
        code,
        message: "This sale only breaks even. Confirm that you want to record it.",
        needsConfirmation: true,
        confirmKind: "breakeven",
      };
    case SALE_ERROR.BLOCKED_BELOW_COST:
      return {
        code,
        message:
          "Selling below cost is blocked in your Settings. Raise the price, or change the setting.",
        needsConfirmation: false,
      };
    case SALE_ERROR.INSUFFICIENT_STOCK:
      return { code, message: raw || "There is not enough stock.", needsConfirmation: false };
    case SALE_ERROR.INVALID_REQUEST:
      return { code, message: raw || "That request was not valid.", needsConfirmation: false };
    case "23505": {
      // Unique violation — name the field that clashed.
      for (const [constraint, message] of Object.entries(CONSTRAINT_MESSAGES)) {
        if (raw.includes(constraint)) return { code, message, needsConfirmation: false };
      }
      return { code, message: "That value is already in use.", needsConfirmation: false };
    }
    case "23514": {
      for (const [constraint, message] of Object.entries(CONSTRAINT_MESSAGES)) {
        if (raw.includes(constraint)) return { code, message, needsConfirmation: false };
      }
      return {
        code,
        message: "Some of those values are not allowed. Please check and try again.",
        needsConfirmation: false,
      };
    }
    case "23503":
      return {
        code,
        message: "That item no longer exists. Refresh and try again.",
        needsConfirmation: false,
      };
    case "23502":
      return { code, message: "A required field is missing.", needsConfirmation: false };
    case "22023":
      return { code, message: raw || "That value is not valid.", needsConfirmation: false };
    case "42501":
      return {
        code,
        message: "You do not have permission to do that.",
        needsConfirmation: false,
      };
    case "28000":
      return { code, message: "Your session has expired. Please sign in again.", needsConfirmation: false };
    case "PGRST301":
      return { code, message: "Your session has expired. Please sign in again.", needsConfirmation: false };
    default:
      break;
  }

  if (raw.toLowerCase().includes("failed to fetch") || raw.toLowerCase().includes("networkerror")) {
    return {
      code,
      message: "No connection. Aurelia needs internet access to record money.",
      needsConfirmation: false,
    };
  }

  return {
    code,
    message: raw || "Something went wrong. Please try again.",
    needsConfirmation: false,
  };
}

/** Map Supabase Auth failures to plain language. */
export function toAuthErrorMessage(error: unknown): string {
  const raw = (error as { message?: string })?.message ?? "";
  const lower = raw.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return "That email and password combination is not right.";
  }
  if (lower.includes("email not confirmed")) {
    return "This email has not been confirmed yet. Check your inbox.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (lower.includes("same as the old password") || lower.includes("should be different")) {
    return "Choose a password you have not used before.";
  }
  if (lower.includes("token") && lower.includes("expired")) {
    return "That reset link has expired. Request a new one.";
  }
  if (lower.includes("failed to fetch")) {
    return "No connection. Check your internet and try again.";
  }
  return raw || "Sign-in failed. Please try again.";
}
