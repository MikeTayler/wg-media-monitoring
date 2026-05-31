/**
 * Centralised date formatting for the app. All dates are rendered in New
 * Zealand time (Pacific/Auckland — NZST/NZDT) using the en-NZ locale, e.g.
 * "Monday, 1 June 2026".
 */

const NZ_TIME_ZONE = "Pacific/Auckland";
const NZ_LOCALE = "en-NZ";

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** e.g. "Monday, 1 June 2026". Returns `fallback` for missing/invalid input. */
export function formatNzDate(
  value: Date | string | number | null | undefined,
  fallback = "—"
): string {
  const d = toDate(value);
  if (!d) return fallback;
  return d.toLocaleDateString(NZ_LOCALE, {
    timeZone: NZ_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** e.g. "Monday, 1 June 2026, 10:18 AM" in NZ time. */
export function formatNzDateTime(
  value: Date | string | number | null | undefined,
  fallback = "—"
): string {
  const d = toDate(value);
  if (!d) return fallback;
  return d.toLocaleString(NZ_LOCALE, {
    timeZone: NZ_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
