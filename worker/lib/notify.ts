// Sends push notifications to the right people in a shop: the booking's barber and the owners.
import type { Env, ShopRow } from "../env";
import { sendPush, type VapidKeys } from "./webpush";
import { fmtDateShort, fmtMin, minutesSince, minutesUntil, nowInZone, addDays } from "../../shared/time";

export interface Notice {
  title: string;
  body: string;
  /** Page to open when tapped, e.g. /admin/bookings/12 */
  url: string;
  /** Same tag replaces an older notification on the phone instead of stacking. */
  tag: string;
}

export function vapidFromEnv(env: Env): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || "https://qatarsaloon.com" };
}

interface SubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function deliver(env: Env, subs: SubRow[], notice: Notice) {
  const vapid = vapidFromEnv(env);
  if (!vapid || subs.length === 0) return;
  await Promise.all(
    subs.map(async (s) => {
      try {
        const r = await sendPush(s, notice, vapid, { topic: notice.tag });
        if (r.gone) await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(s.id).run();
        else if (r.ok) await env.DB.prepare("UPDATE push_subscriptions SET last_ok_at = datetime('now') WHERE id = ?").bind(s.id).run();
        else console.error("push failed", r.status, new URL(s.endpoint).host);
      } catch (e) {
        console.error("push error", e);
      }
    })
  );
}

/** Notifies the owners of a shop and the given barber (if they have their own login). */
export async function notifyBarber(env: Env, shopId: number, barberId: number, notice: Notice) {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.endpoint, p.p256dh, p.auth FROM push_subscriptions p JOIN users u ON u.id = p.user_id
     WHERE p.shop_id = ? AND u.active = 1 AND (u.role = 'owner' OR (u.role = 'barber' AND u.barber_id = ?))`
  )
    .bind(shopId, barberId)
    .all<SubRow>();
  await deliver(env, results, notice);
}

/** Notifies every device of one user (for the "send test" button). */
export async function notifyUser(env: Env, userId: number, notice: Notice) {
  const { results } = await env.DB.prepare("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?").bind(userId).all<SubRow>();
  await deliver(env, results, notice);
  return results.length;
}

interface BookingInfo {
  id: number;
  shop_id: number;
  barber_id: number;
  date: string;
  start_min: number;
  customer_name: string | null;
  barber_name: string | null;
  services: string | null;
  barbers_in_shop: number;
}

async function bookingInfo(env: Env, bookingId: number): Promise<BookingInfo | null> {
  return env.DB.prepare(
    `SELECT b.id, b.shop_id, b.barber_id, b.date, b.start_min, c.name AS customer_name, br.name AS barber_name,
       (SELECT GROUP_CONCAT(name, ' + ') FROM booking_services s WHERE s.booking_id = b.id) AS services,
       (SELECT COUNT(*) FROM barbers x WHERE x.shop_id = b.shop_id AND x.active = 1) AS barbers_in_shop
     FROM bookings b LEFT JOIN customers c ON c.id = b.customer_id LEFT JOIN barbers br ON br.id = b.barber_id
     WHERE b.id = ?`
  )
    .bind(bookingId)
    .first<BookingInfo>();
}

const describe = (b: BookingInfo) =>
  [b.customer_name || "A customer", b.services || "", `${fmtDateShort(b.date)} ${fmtMin(b.start_min)}`, b.barbers_in_shop > 1 && b.barber_name ? `with ${b.barber_name}` : ""]
    .filter(Boolean)
    .join(" · ");

export async function notifyNewBooking(env: Env, bookingId: number) {
  const b = await bookingInfo(env, bookingId);
  if (!b) return;
  await notifyBarber(env, b.shop_id, b.barber_id, {
    title: "New booking request",
    body: `${describe(b)}. Tap to confirm.`,
    url: `/admin/bookings/${b.id}`,
    tag: `booking-${b.id}`,
  });
}

export async function notifyCancelled(env: Env, bookingId: number) {
  const b = await bookingInfo(env, bookingId);
  if (!b) return;
  await notifyBarber(env, b.shop_id, b.barber_id, {
    title: "Booking cancelled",
    body: `${describe(b)}. The slot is free again.`,
    url: `/admin/bookings/${b.id}`,
    tag: `booking-${b.id}`,
  });
}

/**
 * Runs every few minutes: nudges the barber to send each WhatsApp reminder once its time comes
 * (e.g. 1 hour before). Skipped when the booking was confirmed inside that window, since the
 * confirmation message was just sent.
 */
export async function sendReminderNudges(env: Env) {
  const { results: shops } = await env.DB.prepare("SELECT * FROM shops WHERE active = 1").all<ShopRow>();
  for (const shop of shops) {
    if (shop.reminder_min <= 0) continue;
    const now = nowInZone(shop.timezone);
    const { results } = await env.DB.prepare(
      `SELECT b.id, b.date, b.start_min, b.confirmed_at FROM bookings b JOIN customers c ON c.id = b.customer_id
       WHERE b.shop_id = ? AND b.status = 'confirmed' AND b.source <> 'walkin'
         AND b.reminder_sent_at IS NULL AND b.reminder_notified_at IS NULL
         AND (c.phone IS NOT NULL OR c.whatsapp IS NOT NULL)
         AND b.date IN (?, ?)`
    )
      .bind(shop.id, now.date, addDays(now.date, 1))
      .all<{ id: number; date: string; start_min: number; confirmed_at: string | null }>();
    for (const row of results) {
      const until = minutesUntil(now, row.date, row.start_min);
      if (until <= 0 || until > shop.reminder_min) continue;
      await env.DB.prepare("UPDATE bookings SET reminder_notified_at = datetime('now') WHERE id = ?").bind(row.id).run();
      const confirmedInWindow = row.confirmed_at !== null && minutesSince(row.confirmed_at) <= shop.reminder_min - until;
      if (confirmedInWindow) continue;
      const b = await bookingInfo(env, row.id);
      if (!b) continue;
      await notifyBarber(env, b.shop_id, b.barber_id, {
        title: `Send a reminder to ${b.customer_name?.split(" ")[0] || "your customer"}`,
        body: `${b.services || "Booking"} at ${fmtMin(b.start_min)}${b.barbers_in_shop > 1 && b.barber_name ? ` with ${b.barber_name}` : ""}. Tap to send it on WhatsApp.`,
        url: `/admin/bookings/${b.id}`,
        tag: `reminder-${b.id}`,
      });
    }
  }
}

/** Housekeeping: drop expired login sessions. */
export async function cleanup(env: Env) {
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(new Date().toISOString()).run();
}

/** Tells a barber (their own login only) that someone else added a booking for them. */
export async function notifyBarberOnly(env: Env, shopId: number, barberId: number, bookingId: number) {
  const b = await bookingInfo(env, bookingId);
  if (!b) return;
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.endpoint, p.p256dh, p.auth FROM push_subscriptions p JOIN users u ON u.id = p.user_id
     WHERE p.shop_id = ? AND u.active = 1 AND u.role = 'barber' AND u.barber_id = ?`
  )
    .bind(shopId, barberId)
    .all<SubRow>();
  await deliver(env, results, {
    title: "New booking added for you",
    body: `${b.customer_name || "A customer"} · ${b.services || ""} · ${fmtDateShort(b.date)} ${fmtMin(b.start_min)}`,
    url: `/admin/bookings/${b.id}`,
    tag: `booking-${b.id}`,
  });
}
