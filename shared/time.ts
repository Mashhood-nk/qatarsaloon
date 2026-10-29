// Date/time helpers. Dates are 'YYYY-MM-DD' strings in the shop's time zone,
// times of day are minutes since midnight.

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export { WEEKDAYS_SHORT, WEEKDAYS_LONG };

export function isDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toUtcDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(date: string): number {
  return toUtcDate(date).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const dt = toUtcDate(date);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "4:30 PM" for customer-facing messages. */
export function fmtMin12(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

/** "Sat 31 Oct" */
export function fmtDateShort(date: string): string {
  const dt = toUtcDate(date);
  return `${WEEKDAYS_SHORT[dt.getUTCDay()]} ${dt.getUTCDate()} ${MONTHS_SHORT[dt.getUTCMonth()]}`;
}

/** "Saturday 31 Oct" */
export function fmtDateLong(date: string): string {
  const dt = toUtcDate(date);
  return `${WEEKDAYS_LONG[dt.getUTCDay()]} ${dt.getUTCDate()} ${MONTHS_SHORT[dt.getUTCMonth()]}`;
}

export function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Current date and minute of the day in a time zone. */
export function nowInZone(timeZone: string, at: Date = new Date()): { date: string; min: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    min: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** Whole minutes between an ISO timestamp and now (or another timestamp). */
export function minutesSince(iso: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
}

/** Minutes from now (date/min in shop zone) until a date/min in the same zone. */
export function minutesUntil(now: { date: string; min: number }, date: string, min: number): number {
  const dayDiff = Math.round((toUtcDate(date).getTime() - toUtcDate(now.date).getTime()) / 86400000);
  return dayDiff * 1440 + (min - now.min);
}
