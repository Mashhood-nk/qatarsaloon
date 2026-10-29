// Live schedule logic for the admin: who's running over, who's late, which reminders are due.
import { useEffect, useState } from "react";
import { minutesUntil } from "../../shared/time";
import type { AdminBookingDto, ShopSettings } from "../../shared/types";
import { minuteOfDay, round5 } from "./format";

/** Re-renders every `ms` so timers and "late by" stay current. */
export function useTick(ms: number, enabled = true) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => set((n) => n + 1), ms);
    return () => window.clearInterval(id);
  }, [ms, enabled]);
}

export interface Now {
  date: string;
  min: number;
}

/** Server "now" at load time, moved forward by the time since loading. */
export function liveNow(serverDate: string, serverMin: number, loadedAt: number): Now {
  const passed = Math.floor((Date.now() - loadedAt) / 60000);
  const min = serverMin + passed;
  return min < 1440 ? { date: serverDate, min } : { date: serverDate, min: 1439 };
}

export function actualMinutes(b: AdminBookingDto): number | null {
  if (!b.started_at || !b.finished_at) return null;
  return Math.max(1, Math.round((new Date(b.finished_at).getTime() - new Date(b.started_at).getTime()) / 60000));
}

export function elapsedSeconds(b: AdminBookingDto): number {
  return b.started_at ? Math.max(0, Math.floor((Date.now() - new Date(b.started_at).getTime()) / 1000)) : 0;
}

export function fmtTimer(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export interface Delay {
  running: AdminBookingDto;
  overByMin: number;
  /** How late the next booking will start, rounded up to 5 minutes. 0 if not affected. */
  delayMin: number;
  next: AdminBookingDto | null;
}

/** Is the visit in the chair running over, and does it push the next booking? */
export function runningDelay(bookings: AdminBookingDto[], now: Now, settings: ShopSettings, timeZone: string): Delay | null {
  const running = bookings.find((b) => b.status === "in_progress");
  if (!running || !running.started_at) return null;
  const startedMin = minuteOfDay(running.started_at, timeZone);
  const expectedEnd = startedMin + running.duration_min;
  const overByMin = Math.max(0, now.min - expectedEnd);
  const projectedEnd = Math.max(expectedEnd, now.min + 5); // assume at least 5 more minutes once over
  const next =
    bookings
      .filter((b) => (b.status === "confirmed" || b.status === "pending") && b.id !== running.id && b.start_min >= running.start_min)
      .sort((a, b) => a.start_min - b.start_min)[0] ?? null;
  const rawDelay = next ? projectedEnd + settings.buffer_min - next.start_min : 0;
  return { running, overByMin, delayMin: rawDelay > 0 && overByMin > 0 ? round5(rawDelay) : 0, next };
}

export type ReminderState = { kind: "sent" } | { kind: "due" } | { kind: "later"; atMin: number } | { kind: "none" };

export function reminderState(b: AdminBookingDto, now: Now, settings: ShopSettings): ReminderState {
  if (b.status !== "confirmed") return { kind: "none" };
  if (b.reminder_sent_at) return { kind: "sent" };
  if (!b.customer?.phone && !b.customer?.whatsapp) return { kind: "none" };
  if (b.source === "walkin") return { kind: "none" };
  const until = minutesUntil(now, b.date, b.start_min);
  if (until <= 0) return { kind: "none" };
  if (until <= settings.reminder_min) return { kind: "due" };
  return { kind: "later", atMin: b.start_min - settings.reminder_min };
}

/** Minutes a confirmed booking is past its start without having started (0 if not). */
export function lateBy(b: AdminBookingDto, now: Now): number {
  if (b.status !== "confirmed" && b.status !== "pending") return 0;
  const until = minutesUntil(now, b.date, b.start_min);
  return until < 0 ? -until : 0;
}
