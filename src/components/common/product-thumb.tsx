import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";

const SIZES = {
  xs: { box: "size-9 rounded-[--radius-xs]", text: "text-[0.625rem]", px: 36 },
  sm: { box: "size-12 rounded-[--radius-sm]", text: "text-xs", px: 48 },
  md: { box: "size-16 rounded-[--radius-sm]", text: "text-sm", px: 64 },
  lg: { box: "size-20 rounded-[--radius-md]", text: "text-base", px: 80 },
  tile: { box: "aspect-square w-full rounded-[--radius-md]", text: "text-2xl", px: 400 },
  hero: { box: "aspect-[4/3] w-full rounded-[--radius-lg]", text: "text-4xl", px: 800 },
} as const;

/**
 * Product image with a considered fallback.
 *
 * When there is no photo the initials sit on a champagne wash rather than a grey
 * box — an un-photographed product should still look like it belongs in a
 * boutique. `unoptimized` is off so Supabase-hosted images get resized by Next.
 */
export function ProductThumb({
  src,
  name,
  size = "sm",
  className,
  priority = false,
}: {
  src: string | null | undefined;
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
  priority?: boolean;
}) {
  const s = SIZES[size];

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden border border-line bg-[--gold-soft]",
        s.box,
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={name}
          fill
          sizes={`${s.px}px`}
          priority={priority}
          className="object-cover"
        />
      ) : (
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center gradient-champagne font-medium tracking-wide text-gold",
            s.text,
          )}
          aria-hidden
        >
          {initials(name) || "·"}
        </span>
      )}
    </div>
  );
}
