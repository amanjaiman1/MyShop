"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PaymentMethod, ProductOverviewRow } from "@/lib/supabase/database.types";
import { uuid } from "@/lib/utils";
import type { Minor } from "@/lib/money";

/**
 * The point-of-sale cart.
 *
 * Persisted to localStorage so a half-built sale survives an accidental refresh
 * at the till. `clientRequestId` is minted per cart and sent with the sale so a
 * double-submit can never post twice — it is rotated only after a successful
 * (non-duplicate) completion.
 *
 * Prices and discounts here are the owner's *intent*. The authoritative money —
 * FIFO cost, totals, profit — is always recomputed by the database.
 */
export interface CartItem {
  key: string;
  productId: string;
  name: string;
  brand: string | null;
  shade: string | null;
  imageUrl: string | null;
  internalCode: string;
  quantity: number;
  /** Owner's chosen selling price (minor units). Seeded from recommended. */
  unitSellingPrice: Minor;
  recommendedPrice: Minor;
  minimumPrice: Minor;
  fifoUnitCost: Minor | null;
  maxOpenBatchCost: Minor | null;
  quantityOnHand: number;
  lineDiscount: Minor;
}

interface CartState {
  items: CartItem[];
  orderDiscount: Minor;
  paymentMethod: PaymentMethod;
  notes: string;
  clientRequestId: string;

  addProduct: (product: ProductOverviewRow) => void;
  setQuantity: (key: string, quantity: number) => void;
  setUnitPrice: (key: string, price: Minor) => void;
  setLineDiscount: (key: string, discount: Minor) => void;
  removeItem: (key: string) => void;
  setOrderDiscount: (discount: Minor) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setNotes: (notes: string) => void;
  clear: () => void;
  /** After a successful sale: empty the cart and rotate the idempotency key. */
  reset: () => void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      orderDiscount: 0,
      paymentMethod: "cash",
      notes: "",
      clientRequestId: uuid(),

      addProduct: (product) =>
        set((state) => {
          const existing = state.items.find((i) => i.productId === product.id);
          if (existing) {
            // Scanning the same product again bumps its quantity.
            return {
              items: state.items.map((i) =>
                i.productId === product.id
                  ? { ...i, quantity: Math.min(i.quantity + 1, i.quantityOnHand || i.quantity + 1) }
                  : i,
              ),
            };
          }
          const item: CartItem = {
            key: uuid(),
            productId: product.id,
            name: product.name,
            brand: product.brand,
            shade: product.shade_or_variant,
            imageUrl: product.image_url,
            internalCode: product.internal_code,
            quantity: 1,
            unitSellingPrice: product.recommended_selling_price,
            recommendedPrice: product.recommended_selling_price,
            minimumPrice: product.minimum_selling_price,
            fifoUnitCost: product.fifo_unit_cost,
            maxOpenBatchCost: product.max_open_batch_cost,
            quantityOnHand: product.quantity_on_hand,
            lineDiscount: 0,
          };
          return { items: [...state.items, item] };
        }),

      setQuantity: (key, quantity) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.key === key ? { ...i, quantity: Math.max(1, quantity) } : i,
          ),
        })),

      setUnitPrice: (key, price) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.key === key ? { ...i, unitSellingPrice: Math.max(0, price) } : i,
          ),
        })),

      setLineDiscount: (key, discount) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.key === key ? { ...i, lineDiscount: Math.max(0, discount) } : i,
          ),
        })),

      removeItem: (key) =>
        set((state) => ({ items: state.items.filter((i) => i.key !== key) })),

      setOrderDiscount: (orderDiscount) => set({ orderDiscount: Math.max(0, orderDiscount) }),
      setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
      setNotes: (notes) => set({ notes }),

      clear: () => set({ items: [], orderDiscount: 0, notes: "" }),
      reset: () =>
        set({
          items: [],
          orderDiscount: 0,
          notes: "",
          paymentMethod: "cash",
          clientRequestId: uuid(),
        }),
    }),
    {
      name: "aurelia:cart",
      // Persist the working cart, but never the payment method default noise.
      partialize: (state) => ({
        items: state.items,
        orderDiscount: state.orderDiscount,
        notes: state.notes,
        clientRequestId: state.clientRequestId,
      }),
    },
  ),
);

/** Cart line count (distinct products), for the nav badge. */
export function cartCount(items: CartItem[]): number {
  return items.length;
}
