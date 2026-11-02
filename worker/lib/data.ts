// Database loaders and row-to-DTO mappers shared by the public and admin routes.
import type { ShopRow } from "../env";
import type { DayInput } from "../../shared/slots";
import { weekdayOf } from "../../shared/time";
import type {
  AdminBookingDto,
  BookingServiceDto,
  BookingStatus,
  BookingSource,
  BreakDto,
  CustomerDto,
  DayHoursDto,
  GalleryDto,
  ServiceDto,
  ShopSettings,
  TimeOffDto,
} from "../../shared/types";
import { bad } from "./util";

export const imageUrl = (key: string | null) => (key ? `/api/img/${key}` : null);

export function settingsOf(shop: ShopRow): ShopSettings {
  return {
    slot_step_min: shop.slot_step_min,
    buffer_min: shop.buffer_min,
    grace_min: shop.grace_min,
    reminder_min: shop.reminder_min,
    reopen_min: shop.reopen_min,
    change_cutoff_min: shop.change_cutoff_min,
    min_notice_min: shop.min_notice_min,
    booking_days_ahead: shop.booking_days_ahead,
  };
}

export interface BarberInfo {
  id: number;
  name: string;
}

export async function activeBarbers(db: D1Database, shopId: number): Promise<BarberInfo[]> {
  const { results } = await db
    .prepare("SELECT id, name FROM barbers WHERE shop_id = ? AND active = 1 ORDER BY sort, id")
    .bind(shopId)
    .all<BarberInfo>();
  return results;
}

/** Gives a new barber a starting week: copied from another barber, or 10:00-22:00 with Friday from 16:00. */
export async function seedBarberSchedule(db: D1Database, shopId: number, barberId: number, copyFrom: number | null) {
  if (copyFrom) {
    await db.batch([
      db
        .prepare(
          `INSERT INTO working_hours (barber_id, shop_id, weekday, open_min, close_min, closed)
           SELECT ?, shop_id, weekday, open_min, close_min, closed FROM working_hours WHERE barber_id = ?`
        )
        .bind(barberId, copyFrom),
      db
        .prepare(
          `INSERT INTO breaks (shop_id, barber_id, weekday, start_min, end_min, label)
           SELECT shop_id, ?, weekday, start_min, end_min, label FROM breaks WHERE barber_id = ?`
        )
        .bind(barberId, copyFrom),
    ]);
    const n = await db.prepare("SELECT COUNT(*) AS n FROM working_hours WHERE barber_id = ?").bind(barberId).first<{ n: number }>();
    if ((n?.n ?? 0) > 0) return;
  }
  await db.batch(
    [0, 1, 2, 3, 4, 5, 6].map((wd) =>
      db
        .prepare("INSERT OR IGNORE INTO working_hours (barber_id, shop_id, weekday, open_min, close_min, closed) VALUES (?, ?, ?, ?, 1320, 0)")
        .bind(barberId, shopId, wd, wd === 5 ? 960 : 600)
    )
  );
}

export async function defaultBarberId(db: D1Database, shopId: number): Promise<number> {
  const b = await db
    .prepare("SELECT id FROM barbers WHERE shop_id = ? AND active = 1 ORDER BY sort, id LIMIT 1")
    .bind(shopId)
    .first<{ id: number }>();
  if (!b) throw bad("This shop isn't taking bookings yet");
  return b.id;
}

interface ServiceRow {
  id: number;
  name: string;
  duration_min: number;
  price: number;
  active: number;
  sort: number;
}

export const serviceDto = (r: ServiceRow): ServiceDto => ({
  id: r.id,
  name: r.name,
  duration_min: r.duration_min,
  price: r.price,
  active: !!r.active,
  sort: r.sort,
});

export async function listServices(db: D1Database, shopId: number, onlyActive: boolean): Promise<ServiceDto[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, duration_min, price, active, sort FROM services
       WHERE shop_id = ? AND deleted = 0 ${onlyActive ? "AND active = 1" : ""} ORDER BY sort, id`
    )
    .bind(shopId)
    .all<ServiceRow>();
  return results.map(serviceDto);
}

/** Loads the chosen services (active, belonging to the shop) and totals them. */
export async function pickServices(db: D1Database, shopId: number, ids: number[], allowInactive = false) {
  const all = await listServices(db, shopId, !allowInactive);
  const chosen = ids.map((id) => all.find((s) => s.id === id));
  if (chosen.some((s) => !s)) throw bad("One of the services is no longer available");
  const services = chosen as ServiceDto[];
  return {
    services,
    duration: services.reduce((t, s) => t + s.duration_min, 0),
    price: services.reduce((t, s) => t + s.price, 0),
  };
}

export async function weeklyHours(db: D1Database, barberId: number): Promise<DayHoursDto[]> {
  const { results } = await db
    .prepare("SELECT weekday, open_min, close_min, closed FROM working_hours WHERE barber_id = ? ORDER BY weekday")
    .bind(barberId)
    .all<{ weekday: number; open_min: number; close_min: number; closed: number }>();
  return [0, 1, 2, 3, 4, 5, 6].map((wd) => {
    const r = results.find((x) => x.weekday === wd);
    return r
      ? { weekday: wd, open_min: r.open_min, close_min: r.close_min, closed: !!r.closed }
      : { weekday: wd, open_min: 600, close_min: 1320, closed: true };
  });
}

export async function listBreaks(db: D1Database, barberId: number): Promise<BreakDto[]> {
  const { results } = await db
    .prepare("SELECT id, weekday, start_min, end_min, label FROM breaks WHERE barber_id = ? ORDER BY start_min")
    .bind(barberId)
    .all<BreakDto>();
  return results;
}

export async function listGallery(db: D1Database, shopId: number): Promise<GalleryDto[]> {
  const { results } = await db
    .prepare("SELECT id, image_key, caption FROM gallery WHERE shop_id = ? ORDER BY sort, id")
    .bind(shopId)
    .all<{ id: number; image_key: string; caption: string }>();
  return results.map((r) => ({ id: r.id, url: imageUrl(r.image_key)!, caption: r.caption }));
}

/**
 * Everything the slot engine needs for one barber on one date.
 * nowMin (today only) stretches a running visit that has gone over its booked time.
 */
export async function loadDay(
  db: D1Database,
  shop: ShopRow,
  barberId: number,
  date: string,
  opts: { excludeBookingId?: number; nowMin?: number } = {}
) {
  const wd = weekdayOf(date);
  const [hoursRow, breaks, timeOff, bookings] = await db.batch<any>([
    db.prepare("SELECT open_min, close_min, closed FROM working_hours WHERE barber_id = ? AND weekday = ?").bind(barberId, wd),
    db
      .prepare("SELECT start_min, end_min, label FROM breaks WHERE barber_id = ? AND (weekday IS NULL OR weekday = ?) ORDER BY start_min")
      .bind(barberId, wd),
    db.prepare("SELECT id, date, start_min, end_min, reason FROM time_off WHERE barber_id = ? AND date = ? ORDER BY start_min").bind(barberId, date),
    db
      .prepare(
        `SELECT id, start_min, duration_min, status FROM bookings
         WHERE barber_id = ? AND date = ? AND status IN ('pending','confirmed','in_progress')`
      )
      .bind(barberId, date),
  ]);
  const h = hoursRow.results[0] as { open_min: number; close_min: number; closed: number } | undefined;
  const hours = h && !h.closed ? { open: h.open_min, close: h.close_min } : null;
  const breakList = breaks.results as { start_min: number; end_min: number; label: string }[];
  const timeOffList = timeOff.results as TimeOffDto[];
  const bookingList = (bookings.results as { id: number; start_min: number; duration_min: number; status: string }[])
    .filter((b) => b.id !== opts.excludeBookingId)
    .map((b) => {
      let duration = b.duration_min;
      if (b.status === "in_progress" && opts.nowMin !== undefined) duration = Math.max(duration, opts.nowMin - b.start_min + 1);
      return { start: b.start_min, duration };
    });
  const input: DayInput = {
    hours,
    breaks: breakList.map((b) => ({ start: b.start_min, end: b.end_min })),
    timeOff: timeOffList.map((t) => ({ start: t.start_min, end: t.end_min })),
    bookings: bookingList,
    bufferMin: shop.buffer_min,
    stepMin: shop.slot_step_min,
  };
  return { input, hours, breaks: breakList, timeOff: timeOffList };
}

interface BookingJoinRow {
  id: number;
  barber_id: number;
  barber_name: string | null;
  token: string;
  status: BookingStatus;
  source: BookingSource;
  date: string;
  start_min: number;
  duration_min: number;
  price_total: number;
  started_at: string | null;
  finished_at: string | null;
  reminder_sent_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  cancelled_by: "customer" | "shop" | null;
  cancelled_at: string | null;
  seen_at: string | null;
  c_id: number | null;
  c_phone: string | null;
  c_name: string | null;
  c_whatsapp: string | null;
  c_prefs: string | null;
  c_notes: string | null;
  c_is_guest: number | null;
  c_created_at: string | null;
  c_visits: number | null;
  c_no_shows: number | null;
}

export const BOOKING_SELECT = `
  SELECT b.id, b.barber_id, br.name AS barber_name, b.token, b.status, b.source, b.date, b.start_min, b.duration_min, b.price_total,
         b.started_at, b.finished_at, b.reminder_sent_at, b.confirmed_at, b.created_at,
         b.cancelled_by, b.cancelled_at, b.seen_at,
         c.id AS c_id, c.phone AS c_phone, c.name AS c_name, c.whatsapp AS c_whatsapp, c.prefs AS c_prefs,
         c.notes AS c_notes, c.is_guest AS c_is_guest, c.created_at AS c_created_at,
         (SELECT COUNT(*) FROM bookings x WHERE x.customer_id = c.id AND x.status = 'done') AS c_visits,
         (SELECT COUNT(*) FROM bookings x WHERE x.customer_id = c.id AND x.status = 'no_show') AS c_no_shows
  FROM bookings b
  LEFT JOIN customers c ON c.id = b.customer_id
  LEFT JOIN barbers br ON br.id = b.barber_id`;

export function parsePrefs(s: string | null): string[] {
  try {
    const v = JSON.parse(s ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function customerDto(r: {
  id: number;
  phone: string | null;
  name: string;
  whatsapp: string | null;
  prefs: string | null;
  notes: string | null;
  is_guest: number;
  created_at: string;
}): CustomerDto {
  return {
    id: r.id,
    phone: r.phone,
    name: r.name,
    whatsapp: r.whatsapp,
    prefs: parsePrefs(r.prefs),
    notes: r.notes ?? "",
    is_guest: !!r.is_guest,
    created_at: r.created_at,
  };
}

/** Runs a BOOKING_SELECT query and attaches each booking's services. */
export async function queryBookings(db: D1Database, where: string, params: unknown[]): Promise<AdminBookingDto[]> {
  const { results } = await db.prepare(`${BOOKING_SELECT} WHERE ${where}`).bind(...params).all<BookingJoinRow>();
  if (results.length === 0) return [];
  const ids = results.map((r) => r.id);
  const services: (BookingServiceDto & { booking_id: number })[] = [];
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const res = await db
      .prepare(
        `SELECT booking_id, service_id, name, duration_min, price FROM booking_services
         WHERE booking_id IN (${chunk.map(() => "?").join(",")})`
      )
      .bind(...chunk)
      .all<BookingServiceDto & { booking_id: number }>();
    services.push(...res.results);
  }
  return results.map((r) => ({
    id: r.id,
    barber_id: r.barber_id,
    barber_name: r.barber_name ?? "",
    token: r.token,
    status: r.status,
    source: r.source,
    date: r.date,
    start_min: r.start_min,
    duration_min: r.duration_min,
    price_total: r.price_total,
    started_at: r.started_at,
    finished_at: r.finished_at,
    reminder_sent_at: r.reminder_sent_at,
    confirmed_at: r.confirmed_at,
    created_at: r.created_at,
    cancelled_by: r.cancelled_by,
    cancelled_at: r.cancelled_at,
    seen_at: r.seen_at,
    services: services
      .filter((s) => s.booking_id === r.id)
      .map(({ service_id, name, duration_min, price }) => ({ service_id, name, duration_min, price })),
    customer:
      r.c_id === null
        ? null
        : {
            ...customerDto({
              id: r.c_id,
              phone: r.c_phone,
              name: r.c_name ?? "",
              whatsapp: r.c_whatsapp,
              prefs: r.c_prefs,
              notes: r.c_notes,
              is_guest: r.c_is_guest ?? 0,
              created_at: r.c_created_at ?? "",
            }),
            visits: r.c_visits ?? 0,
            no_shows: r.c_no_shows ?? 0,
          },
  }));
}

/** Finds a customer by phone or creates one. Updates name/WhatsApp when given. */
export async function upsertCustomer(
  db: D1Database,
  shopId: number,
  phone: string,
  name: string,
  whatsapp: string | null
): Promise<number> {
  const wa = whatsapp && whatsapp !== phone ? whatsapp : null;
  const existing = await db
    .prepare("SELECT id FROM customers WHERE shop_id = ? AND phone = ?")
    .bind(shopId, phone)
    .first<{ id: number }>();
  if (existing) {
    await db
      .prepare("UPDATE customers SET name = CASE WHEN ? <> '' THEN ? ELSE name END, whatsapp = ? WHERE id = ?")
      .bind(name, name, wa, existing.id)
      .run();
    return existing.id;
  }
  const row = await db
    .prepare("INSERT INTO customers (shop_id, phone, name, whatsapp) VALUES (?, ?, ?, ?) RETURNING id")
    .bind(shopId, phone, name, wa)
    .first<{ id: number }>();
  return row!.id;
}

export async function insertBooking(
  db: D1Database,
  b: {
    shopId: number;
    barberId: number;
    customerId: number | null;
    date: string;
    startMin: number;
    duration: number;
    price: number;
    status: BookingStatus;
    source: BookingSource;
    token: string;
    startedAt?: string | null;
    confirmedAt?: string | null;
    services: ServiceDto[];
  }
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO bookings (shop_id, barber_id, customer_id, date, start_min, duration_min, price_total,
                             status, source, token, started_at, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
    )
    .bind(
      b.shopId,
      b.barberId,
      b.customerId,
      b.date,
      b.startMin,
      b.duration,
      b.price,
      b.status,
      b.source,
      b.token,
      b.startedAt ?? null,
      b.confirmedAt ?? null
    )
    .first<{ id: number }>();
  const id = row!.id;
  await db.batch(
    b.services.map((s) =>
      db
        .prepare("INSERT INTO booking_services (booking_id, service_id, name, duration_min, price) VALUES (?, ?, ?, ?, ?)")
        .bind(id, s.id, s.name, s.duration_min, s.price)
    )
  );
  return id;
}
