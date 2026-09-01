import Link from "next/link";
import { Compass, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-[--radius-xl] gradient-champagne border border-[--gold-soft] shadow-sm">
        <Compass className="size-7 text-gold" strokeWidth={1.5} aria-hidden />
      </span>
      <p className="eyebrow mt-6">Error 404</p>
      <h1 className="display-title mt-2 text-3xl text-ink-strong">This page slipped away</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
        The page you were looking for doesn&rsquo;t exist, or may have moved.
        Let&rsquo;s get you back to your shop.
      </p>
      <Button asChild className="mt-6">
        <Link href="/dashboard">
          <Home aria-hidden />
          Back to dashboard
        </Link>
      </Button>
    </div>
  );
}
