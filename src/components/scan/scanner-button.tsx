"use client";

import * as React from "react";
import { ScanLine } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BarcodeScanner } from "./barcode-scanner";

/**
 * A button that opens the camera scanner in a dialog and returns the first code
 * scanned (or typed). Reused by the product form, purchase and sell flows.
 */
export function ScannerButton({
  onScan,
  label,
  variant = "outline",
  size = "icon",
  title = "Scan a code",
  description = "Point the rear camera at a barcode or QR code.",
}: {
  onScan: (code: string) => void;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  title?: string;
  description?: string;
}) {
  const [open, setOpen] = React.useState(false);

  function handle(code: string) {
    onScan(code);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant={variant}
        size={label ? (size === "icon" ? "default" : size) : size}
        onClick={() => setOpen(true)}
        aria-label={label ?? "Scan a code"}
      >
        <ScanLine aria-hidden />
        {label}
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open ? <BarcodeScanner onDetected={handle} onManualEntry={handle} /> : null}
      </DialogContent>
    </Dialog>
  );
}
