import { MINOR_UNITS_PER_MAJOR, type Minor } from "./money";

/**
 * CSV export.
 *
 * Money is emitted as a plain decimal in major units (e.g. 249.50) so a
 * spreadsheet reads it as a number, never as "₹249.50" text. Every field is RFC
 * 4180 quoted, and a leading apostrophe guard is added to values that a
 * spreadsheet might mistake for a formula (=, +, -, @) — a small but real
 * CSV-injection defence.
 */

export type CsvValue = string | number | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvValue;
}

/** Format minor units as a bare decimal for a CSV cell. */
export function csvMoney(minor: Minor | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const major = Math.floor(abs / MINOR_UNITS_PER_MAJOR);
  const frac = abs % MINOR_UNITS_PER_MAJOR;
  return `${negative ? "-" : ""}${major}.${String(frac).padStart(2, "0")}`;
}

function escapeCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escapeCell(c.value(row))).join(","))
    .join("\r\n");
  // BOM so Excel opens UTF-8 (₹, é, …) correctly.
  return `\uFEFF${header}\r\n${body}`;
}

/** Trigger a browser download of a CSV string. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Build a dated filename like `aurelia-sales-2026-09-01.csv`. */
export function csvFilename(kind: string, suffix?: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `aurelia-${kind}${suffix ? `-${suffix}` : ""}-${today}.csv`;
}
