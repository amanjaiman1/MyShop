import {
  ArrowLeftRight,
  BarChart3,
  CalendarRange,
  Gem,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Receipt,
  ScanLine,
  Settings,
  ShoppingBag,
  Sparkles,
  Truck,
  Wallet,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description?: string;
  /** Matches nested routes, e.g. /products/abc highlights Products. */
  matchPrefix?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/** Desktop sidebar — grouped by what the owner is trying to do. */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        description: "Today at a glance",
      },
    ],
  },
  {
    label: "Trade",
    items: [
      {
        href: "/sell",
        label: "Scan & Sell",
        icon: ScanLine,
        description: "Point of sale",
        matchPrefix: true,
      },
      {
        href: "/sales",
        label: "Sales",
        icon: ShoppingBag,
        description: "Invoice history",
        matchPrefix: true,
      },
      {
        href: "/purchases",
        label: "Purchases",
        icon: Truck,
        description: "Stock you bought",
        matchPrefix: true,
      },
    ],
  },
  {
    label: "Catalogue",
    items: [
      {
        href: "/products",
        label: "Products",
        icon: Package,
        description: "Inventory & pricing",
        matchPrefix: true,
      },
      {
        href: "/movements",
        label: "Stock movements",
        icon: ArrowLeftRight,
        description: "Every in and out",
      },
      {
        href: "/suppliers",
        label: "Suppliers",
        icon: Gem,
        description: "Who you buy from",
        matchPrefix: true,
      },
    ],
  },
  {
    label: "Money",
    items: [
      {
        href: "/expenses",
        label: "Expenses",
        icon: Wallet,
        description: "Running costs",
        matchPrefix: true,
      },
      {
        href: "/reports/pl",
        label: "Profit & Loss",
        icon: BarChart3,
        description: "Any date range",
      },
      {
        href: "/reports/monthly",
        label: "Monthly reports",
        icon: CalendarRange,
        description: "Month by month",
      },
      {
        href: "/reports/yearly",
        label: "Yearly reports",
        icon: Sparkles,
        description: "Year on year",
      },
      {
        href: "/reports/custom",
        label: "Custom reports",
        icon: Receipt,
        description: "Build & export",
      },
    ],
  },
];

/**
 * Mobile bottom navigation — exactly five destinations.
 * Scan/Sell sits in the centre and is rendered as a raised primary action,
 * because it is the thing the owner does dozens of times a day.
 */
export const BOTTOM_NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/products", label: "Inventory", icon: Package, matchPrefix: true },
  { href: "/sell", label: "Scan/Sell", icon: ScanLine, matchPrefix: true },
  { href: "/purchases", label: "Purchases", icon: Truck, matchPrefix: true },
  { href: "/more", label: "More", icon: Settings },
];

/** Everything reachable from the mobile "More" screen. */
export const MORE_SECTIONS: NavSection[] = [
  {
    label: "Money",
    items: [
      { href: "/reports/pl", label: "Profit & Loss", icon: BarChart3, description: "Any date range, with the full statement" },
      { href: "/reports/monthly", label: "Monthly reports", icon: CalendarRange, description: "Every month since you started" },
      { href: "/reports/yearly", label: "Yearly reports", icon: Sparkles, description: "Year totals and comparisons" },
      { href: "/reports/custom", label: "Custom reports & exports", icon: Receipt, description: "Pick a range, download CSV" },
      { href: "/expenses", label: "Expenses", icon: Wallet, description: "Rent, delivery, packaging and more" },
    ],
  },
  {
    label: "Records",
    items: [
      { href: "/sales", label: "Sales history", icon: ShoppingBag, description: "Search, return or void an invoice" },
      { href: "/movements", label: "Stock movements", icon: ArrowLeftRight, description: "A full audit of every unit" },
      { href: "/suppliers", label: "Suppliers", icon: Gem, description: "Contacts for who you buy from" },
    ],
  },
  {
    label: "Shop",
    items: [
      { href: "/settings", label: "Settings", icon: Settings, description: "Currency, timezone, margins and pricing rules" },
    ],
  },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.matchPrefix) {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  return pathname === item.href;
}
