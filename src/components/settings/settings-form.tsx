"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/misc";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { updateSettings } from "@/lib/actions/settings";
import { settingsSchema, type SettingsValues } from "@/lib/schemas";
import { BELOW_COST_BEHAVIOURS, CURRENCY_PRESETS, TIMEZONE_PRESETS } from "@/lib/constants";
import type { ProfileRow } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

/** Owner profile + shop-wide settings: currency, timezone, margins, policy. */
export function SettingsForm({ profile }: { profile: ProfileRow }) {
  const router = useRouter();

  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      display_name: profile.display_name,
      shop_name: profile.shop_name,
      phone: profile.phone ?? "",
      currency_code: profile.currency_code,
      currency_symbol: profile.currency_symbol,
      timezone: profile.timezone,
      target_profit_margin: Number(profile.target_profit_margin),
      low_margin_threshold: Number(profile.low_margin_threshold),
      below_cost_sale_behavior: profile.below_cost_sale_behavior,
    },
  });

  async function onSubmit(values: SettingsValues) {
    const result = await updateSettings(values);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Settings saved");
    router.refresh();
  }

  function applyCurrencyPreset(code: string) {
    const preset = CURRENCY_PRESETS.find((c) => c.code === code);
    if (preset) {
      form.setValue("currency_code", preset.code);
      form.setValue("currency_symbol", preset.symbol);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Shop &amp; owner</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="shop_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Shop name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="display_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Your name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} inputMode="tel" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Currency &amp; timezone</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.watch("currency_code")} onValueChange={applyCurrencyPreset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_PRESETS.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.symbol} · {c.label} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>Used to format every amount in the app.</FormDescription>
            </div>
            <FormField
              control={form.control}
              name="currency_symbol"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency symbol</FormLabel>
                  <FormControl>
                    <Input {...field} className="w-24" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Shop timezone</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIMEZONE_PRESETS.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Every report&rsquo;s “today”, “yesterday” and monthly boundaries use this
                    timezone — not your phone&rsquo;s.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pricing &amp; margins</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="target_profit_margin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target profit margin (%)</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="decimal" className="w-28" />
                    </FormControl>
                    <FormDescription>The margin you aim for on each product.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="low_margin_threshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Low-margin warning at (%)</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="decimal" className="w-28" />
                    </FormControl>
                    <FormDescription>
                      At or below this margin, a price is flagged “low profit”.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="below_cost_sale_behavior"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>When a sale would be below cost</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="gap-2">
                      {BELOW_COST_BEHAVIOURS.map((option) => (
                        <Label
                          key={option.value}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-[--radius-md] border p-3 font-normal transition-colors",
                            field.value === option.value
                              ? "border-primary bg-primary-soft"
                              : "border-line hover:bg-surface-muted",
                          )}
                        >
                          <RadioGroupItem value={option.value} className="mt-0.5" />
                          <span>
                            <span className="block text-sm font-medium text-ink">{option.label}</span>
                            <span className="block text-xs text-muted">{option.hint}</span>
                          </span>
                        </Label>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={form.formState.isSubmitting} loadingText="Saving…">
            <Save aria-hidden />
            Save settings
          </Button>
        </div>
      </form>
    </Form>
  );
}
