import Link from "next/link";
import { Sparkles } from "lucide-react";

/**
 * Auth shell: an editorial split layout. The left panel is decorative on
 * desktop and collapses entirely on a phone, where the form is the only thing
 * that matters.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Editorial panel — desktop only */}
      <aside className="relative hidden overflow-hidden gradient-primary lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute -top-24 -right-24 size-[28rem] rounded-full opacity-25"
          style={{
            background:
              "radial-gradient(circle at center, rgba(255,255,255,0.55) 0%, transparent 65%)",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-20 size-[22rem] rounded-full opacity-20"
          style={{
            background:
              "radial-gradient(circle at center, var(--gold) 0%, transparent 68%)",
          }}
          aria-hidden
        />

        <Link href="/" className="relative inline-flex items-center gap-2.5 text-on-accent">
          <span className="flex size-9 items-center justify-center rounded-[--radius-sm] bg-white/15 backdrop-blur-sm">
            <Sparkles className="size-4.5" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="display-title text-xl tracking-wide">Aurelia</span>
        </Link>

        <div className="relative max-w-md space-y-6">
          <p className="text-[0.6875rem] font-semibold tracking-[0.18em] uppercase text-white/60">
            For the cosmetics reseller
          </p>
          <h2 className="display-title text-[2.75rem] leading-[1.06] text-on-accent">
            Never sell below what you paid again.
          </h2>
          <p className="text-[0.9375rem] leading-relaxed text-white/75">
            Aurelia remembers every purchase cost, batch by batch, and tells you
            the moment a price stops making money — before the sale, not after
            the month.
          </p>
          <dl className="grid grid-cols-3 gap-4 border-t border-white/15 pt-6">
            {[
              ["FIFO", "costing"],
              ["Live", "margin alerts"],
              ["Daily", "profit & loss"],
            ].map(([big, small]) => (
              <div key={big}>
                <dt className="display-title text-2xl text-on-accent">{big}</dt>
                <dd className="mt-0.5 text-xs text-white/60">{small}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="relative text-xs text-white/45">
          Your books stay yours. Every record is scoped to your account.
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[26rem]">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2.5 text-ink-strong lg:hidden"
          >
            <span className="flex size-9 items-center justify-center rounded-[--radius-sm] gradient-primary text-on-accent shadow-[--shadow-primary]">
              <Sparkles className="size-4.5" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="display-title text-xl">Aurelia</span>
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
