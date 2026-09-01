import { AppSidebar } from "@/components/shell/app-sidebar";
import { BottomNav } from "@/components/shell/bottom-nav";
import { MobileHeader } from "@/components/shell/mobile-header";
import { ShopProvider, shopContextFromProfile } from "@/components/providers/shop-provider";
import { getProfile, getShopContext } from "@/lib/supabase/queries";

/**
 * The authenticated application shell.
 *
 * Middleware has already guaranteed a session by the time this renders, so it
 * loads the profile once and hands the shop's currency, timezone and margins to
 * every Client Component below through ShopProvider — no figure is ever
 * formatted with a guessed locale.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [profile, shopCtx] = await Promise.all([getProfile(), getShopContext()]);
  const value = shopContextFromProfile(profile, shopCtx.today);

  return (
    <ShopProvider value={value}>
      <div className="flex min-h-dvh">
        <AppSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader />
          {/* Bottom padding on mobile clears the floating nav bar. */}
          <main className="flex-1 px-4 pt-5 pb-[calc(var(--bottom-nav-h)+2rem)] sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">
            <div className="mx-auto w-full max-w-7xl rise">{children}</div>
          </main>
        </div>

        <BottomNav />
      </div>
    </ShopProvider>
  );
}
