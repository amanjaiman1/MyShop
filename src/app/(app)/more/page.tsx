import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { MORE_SECTIONS } from "@/components/shell/nav-config";
import { getProfile } from "@/lib/supabase/queries";
import { initials } from "@/lib/utils";

export const metadata: Metadata = { title: "More" };
export const dynamic = "force-dynamic";

/** The mobile "More" hub — everything not on the bottom nav. */
export default async function MorePage() {
  const profile = await getProfile();

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={profile.shop_name} title="More" />

      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <span className="flex size-12 items-center justify-center rounded-full bg-plum-soft text-base font-semibold text-plum">
            {initials(profile.display_name) || "A"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink-strong">{profile.display_name}</p>
            <p className="truncate text-xs text-muted">{profile.shop_name}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/settings">Settings</Link>
          </Button>
        </CardContent>
      </Card>

      {MORE_SECTIONS.map((section) => (
        <section key={section.label} className="space-y-2">
          <p className="eyebrow px-1">{section.label}</p>
          <Card>
            <CardContent className="p-0">
              <ul>
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 border-b border-line px-4 py-3.5 transition-colors last:border-0 hover:bg-surface-muted"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-[--radius-sm] bg-surface-sunken text-muted">
                        <item.icon className="size-[1.1rem]" strokeWidth={1.75} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">{item.label}</p>
                        {item.description ? (
                          <p className="truncate text-xs text-muted">{item.description}</p>
                        ) : null}
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ))}

      <form action="/auth/signout" method="post">
        <Button type="submit" variant="destructiveOutline" block>
          <LogOut aria-hidden />
          Sign out
        </Button>
      </form>
    </div>
  );
}
