import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { Figure } from "@/components/common/money";
import { SettingsForm } from "@/components/settings/settings-form";
import { getProfile } from "@/lib/supabase/queries";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await getProfile();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Shop"
        title="Settings"
        description="Your profile and the rules that shape every calculation in Aurelia."
      />

      <SettingsForm profile={profile} />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <Figure label="Using Aurelia since">
              {formatDate(profile.app_started_at.slice(0, 10), "long")}
            </Figure>
            <Figure label="Account">{profile.display_name}</Figure>
          </div>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="destructiveOutline" size="sm">
              <LogOut aria-hidden />
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted">
        Aurelia is a single-owner ledger. Additional users can be added in your Supabase project;
        every record is already scoped per owner.
      </p>
    </div>
  );
}
