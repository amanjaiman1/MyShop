"use client";

import * as React from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { Download, Printer, QrCode, Barcode as BarcodeIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { QuantityInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/misc";
import { Money } from "@/components/common/money";
import { useShop } from "@/components/providers/shop-provider";
import type { Minor } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Printable product labels.
 *
 * Renders the product's internal code as either a Code128 barcode or a QR code,
 * repeated N times on a grid sized for a standard A4 label sheet, then prints
 * (or exports) via the browser. Because 100 identical items share one product
 * code, the owner scans once at the till and enters the quantity.
 */
export function LabelSheet({
  code,
  name,
  price,
  trigger,
}: {
  code: string;
  name: string;
  price: Minor;
  trigger?: React.ReactNode;
}) {
  const { shopName } = useShop();
  const [open, setOpen] = React.useState(false);
  const [count, setCount] = React.useState(12);
  const [format, setFormat] = React.useState<"barcode" | "qr">("barcode");
  const [dataUrl, setDataUrl] = React.useState<string>("");

  // Render the code to a data URL whenever the format changes.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function render() {
      try {
        if (format === "barcode") {
          const canvas = document.createElement("canvas");
          JsBarcode(canvas, code, {
            format: "CODE128",
            displayValue: false,
            margin: 0,
            width: 2,
            height: 48,
            background: "#ffffff",
          });
          if (!cancelled) setDataUrl(canvas.toDataURL("image/png"));
        } else {
          const url = await QRCode.toDataURL(code, {
            margin: 0,
            width: 160,
            color: { dark: "#241f1e", light: "#ffffff" },
          });
          if (!cancelled) setDataUrl(url);
        }
      } catch {
        toast.error("Could not render the label code.");
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [code, format, open]);

  const labels = Array.from({ length: Math.min(Math.max(count, 1), 120) });

  function handlePrint() {
    window.print();
  }

  function handleDownload() {
    // Export the printable sheet as a standalone HTML file the owner can keep
    // or send to a print shop — no server round trip.
    const node = document.getElementById("aurelia-label-sheet");
    if (!node) return;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${name} labels</title>
<style>
  body{margin:0;font-family:system-ui,sans-serif;}
  .sheet{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm;padding:8mm;}
  .label{border:1px solid #ece1d9;border-radius:8px;padding:8px;text-align:center;page-break-inside:avoid;}
  .label img{max-width:100%;height:auto;}
  .name{font-size:11px;font-weight:600;margin:4px 0 2px;color:#241f1e;}
  .meta{font-size:10px;color:#796c66;}
  .code{font-family:monospace;font-size:10px;margin-top:2px;}
</style></head><body>${node.outerHTML}</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${code}-labels.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Printer aria-hidden />
            Print labels
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Product labels</DialogTitle>
          <DialogDescription>
            All units of this product share the code{" "}
            <span className="font-mono font-medium text-ink">{code}</span>. Scan any label at the
            till and enter the quantity being sold.
          </DialogDescription>
        </DialogHeader>

        {/* Controls */}
        <div className="no-print flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label>Label style</Label>
            <ToggleGroup
              type="single"
              value={format}
              onValueChange={(v) => v && setFormat(v as "barcode" | "qr")}
            >
              <ToggleGroupItem value="barcode">
                <BarcodeIcon className="size-4" aria-hidden /> Barcode
              </ToggleGroupItem>
              <ToggleGroupItem value="qr">
                <QrCode className="size-4" aria-hidden /> QR code
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="label-count">Number of labels</Label>
            <QuantityInput
              id="label-count"
              value={String(count)}
              onChange={(e) => setCount(Number(e.target.value.replace(/\D/g, "")) || 1)}
              className="w-24"
            />
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download aria-hidden />
              Download
            </Button>
            <Button size="sm" onClick={handlePrint}>
              <Printer aria-hidden />
              Print
            </Button>
          </div>
        </div>

        {/* Preview / print sheet */}
        <div className="max-h-[50vh] overflow-y-auto rounded-[--radius-md] border border-line bg-surface-sunken p-3">
          <div
            id="aurelia-label-sheet"
            className="sheet grid grid-cols-3 gap-2 bg-white p-2 print-sheet sm:grid-cols-4"
          >
            {labels.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "label flex flex-col items-center rounded-[--radius-sm] border border-line bg-white p-2 text-center",
                )}
              >
                {dataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={dataUrl}
                    alt={code}
                    className={format === "qr" ? "size-16" : "h-10 w-full object-contain"}
                  />
                ) : (
                  <div className="h-10 w-full animate-pulse rounded bg-surface-sunken" />
                )}
                <p className="name mt-1 line-clamp-1 text-[11px] font-semibold text-ink-strong">
                  {name}
                </p>
                <p className="meta text-[10px] text-muted">
                  {shopName} · <Money value={price} size="sm" className="text-[10px]" />
                </p>
                <p className="code font-mono text-[10px] text-muted">{code}</p>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
