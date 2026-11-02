// The slot engine: works out which start times can be offered on one day for one barber.
// Pure functions only (no database, no clock) so it can be unit-tested and reused
// by the API (to list and validate slots) and the admin (to check if a walk-in fits).

export interface Interval {
  start: number; // minutes since midnight, inclusive
  end: number; // minutes since midnight, exclusive
}

export interface BlockingBooking {
  start: number;
  duration: number;
}

export interface DayInput {
  /** Opening hours for the day, or null when closed. */
  hours: { open: number; close: number } | null;
  /** Regular breaks that apply to this day. */
  breaks: Interval[];
  /** One-off time off / quick breaks on this date. */
  timeOff: Interval[];
  /** Bookings that hold time (pending, confirmed, in progress). */
  bookings: BlockingBooking[];
  /** Cleanup time kept free after every visit. */
  bufferMin: number;
  /** Start times are offered every stepMin minutes from opening. */
  stepMin: number;
  /** No start earlier than this (used for "today": now + minimum notice). */
  earliestStart?: number;
}

export interface Slot {
  start: number;
  available: boolean;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Time a booking occupies, including the buffer after it. */
export function occupied(b: BlockingBooking, bufferMin: number): Interval {
  return { start: b.start, end: b.start + b.duration + bufferMin };
}

/** Why a start time can't be used, or null when it can. */
export function conflictAt(
  input: DayInput,
  start: number,
  durationMin: number,
  opts: { ignoreHours?: boolean } = {}
): "closed" | "outside_hours" | "break" | "time_off" | "booked" | "too_soon" | null {
  const { hours } = input;
  const visit: Interval = { start, end: start + durationMin };
  if (!opts.ignoreHours) {
    if (!hours) return "closed";
    if (start < hours.open || visit.end > hours.close) return "outside_hours";
  }
  if (input.earliestStart !== undefined && start < input.earliestStart) return "too_soon";
  if (input.breaks.some((b) => overlaps(visit, b))) return "break";
  if (input.timeOff.some((t) => overlaps(visit, t))) return "time_off";
  const withBuffer: Interval = { start, end: visit.end + input.bufferMin };
  if (input.bookings.some((b) => overlaps(withBuffer, occupied(b, input.bufferMin)))) return "booked";
  return null;
}

/**
 * Start times for a visit of durationMin.
 * - Regular times every stepMin from opening (10:00, 10:30, ...).
 * - Plus the exact moment the barber becomes free after each booking (end + buffer),
 *   break or time off (rounded up to 5 min), so no time is wasted waiting for the next half hour.
 * - Times that fall in a break or time off, or don't fit before closing, are left out.
 * - Regular times taken by other bookings are returned with available = false (shown crossed out).
 * - Times before earliestStart are left out.
 */
export function computeSlots(input: DayInput, durationMin: number): Slot[] {
  const { hours, stepMin } = input;
  if (!hours || durationMin <= 0 || stepMin <= 0) return [];
  const byStart = new Map<number, Slot>();
  for (let start = hours.open; start + durationMin <= hours.close; start += stepMin) {
    const why = conflictAt(input, start, durationMin);
    if (why === null) byStart.set(start, { start, available: true });
    else if (why === "booked") byStart.set(start, { start, available: false });
  }
  const freeFrom = [
    ...input.bookings.map((b) => occupied(b, input.bufferMin).end),
    ...input.breaks.map((b) => b.end),
    ...input.timeOff.map((t) => t.end),
  ].map((m) => Math.ceil(m / 5) * 5);
  for (const start of freeFrom) {
    if (start < hours.open || start + durationMin > hours.close) continue;
    if (byStart.get(start)?.available) continue;
    if (conflictAt(input, start, durationMin) === null) byStart.set(start, { start, available: true });
  }
  return [...byStart.values()].sort((a, b) => a.start - b.start);
}

/**
 * Minutes free from `from` until the next booking, break or time off (or closing).
 * Used to tell Ashique whether a walk-in fits right now.
 */
export function freeMinutesFrom(input: DayInput, from: number): number {
  const ends: number[] = [];
  for (const b of input.bookings) {
    const occ = occupied(b, input.bufferMin);
    if (occ.end > from && occ.start <= from) return 0; // a visit (or its buffer) is happening now
    if (occ.start > from) ends.push(occ.start - input.bufferMin);
  }
  for (const i of [...input.breaks, ...input.timeOff]) {
    if (i.start <= from && i.end > from) return 0;
    if (i.start > from) ends.push(i.start);
  }
  if (input.hours) ends.push(input.hours.close);
  const next = ends.length ? Math.min(...ends) : from + 24 * 60;
  return Math.max(0, next - from);
}
