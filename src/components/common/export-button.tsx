"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { toCsv, downloadCsv, csvFilename, type CsvValue } from "@/lib/csv";

/**
 * Downloads a CSV built from plain, already-shaped rows.
 *
 * Rows are serializable objects (money pre-formatted to decimal strings on the
 * server via csvMoney), and columns map a header to a row key — so this one
 * component powers every export in the app without duplicating CSV logic.
 */
export function ExportButton<T extends Record<string, CsvValue>>({
  rows,
  columns,
  kind,
  suffix,
  label = "Export CSV",
  variant = "outline",
  size = "sm",
  disabled,
}: {
  rows: T[];
  columns: { header: string; key: keyof T }[];
  kind: string;
  suffix?: string;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  disabled?: boolean;
}) {
  function handleExport() {
    const csv = toCsv(
      rows,
      columns.map((c) => ({ header: c.header, value: (row: T) => row[c.key] })),
    );
    downloadCsv(csvFilename(kind, suffix), csv);
  }

  return (
    <Button variant={variant} size={size} onClick={handleExport} disabled={disabled || rows.length === 0}>
      <Download aria-hidden />
      {label}
    </Button>
  );
}
