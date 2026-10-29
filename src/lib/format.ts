import { fmtDateShort, fmtMin, fmtMin12 } from "../../shared/time";

export function money(amount: number, currency: string): string {
  const n = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${n} ${currency}`;
}

export function serviceNames(services: { name: string }[]): string {
  if (services.length === 0) return "";
  if (services.length === 1) return services[0].name;
  return services.map((s) => s.name).join(" + ");
}

export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

export const when = (date: string, min: number) => `${fmtDateShort(date)} · ${fmtMin(min)}`;
export const when12 = (date: string, min: number) => `${fmtDateShort(date)} at ${fmtMin12(min)}`;

/** Rounds up to the nearest 5 minutes, for "running about X minutes behind". */
export const round5 = (n: number) => Math.max(5, Math.ceil(n / 5) * 5);

/** Minute of the day for an ISO timestamp in a time zone. */
export function minuteOfDay(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(
    new Date(iso)
  );
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** Converts a local date + minute in a time zone to a UTC Date. */
export function zonedToUtc(date: string, min: number, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, Math.floor(min / 60), min % 60);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(guess));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asZone = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return new Date(guess - (asZone - guess));
}
