// Customer-facing API: shop page, free slots, booking requests, and the manage-booking link.
import { Hono } from "hono";
import type { AppEnv, ShopRow } from "../env";
import { computeSlots, conflictAt } from "../../shared/slots";
import { addDays, isDateString, minutesUntil, nowInZone } from "../../shared/time";
import { isE164 } from "../../shared/phone";
import type { PublicBookingDto, PublicShopDto, SlotsDto } from "../../shared/types";
import {
  defaultBarberId,
  imageUrl,
  insertBooking,
  listBreaks,
  listGallery,
  listServices,
  loadDay,
  pickServices,
  upsertCustomer,
  weeklyHours,
} from "../lib/data";
import { HttpError, bad, idList, int, notFound, randomToken, readJson, str, nowIso } from "../lib/util";

export const publicRoutes = new Hono<AppEnv>();

async function shopBySlug(db: D1Database, slug: string): Promise<ShopRow> {
  const shop = await db.prepare("SELECT * FROM shops WHERE slug = ? AND active = 1").bind(slug).first<ShopRow>();
  if (!shop) throw notFound("Shop not found");
  return shop;
}

/** Earliest start for online bookings today: enough notice, and freed slots only reopen if far enough away. */
function onlineEarliest(shop: ShopRow, nowMin: number) {
  return nowMin + Math.max(shop.min_notice_min, shop.reopen_min);
}

function checkBookableDate(shop: ShopRow, date: string, today: string) {
  if (!isDateString(date)) throw bad("Pick a valid date");
  if (date < today || date > addDays(today, shop.booking_days_ahead)) throw bad("That date isn't open for booking");
}

publicRoutes.get("/shops/:slug", async (c) => {
  const db = c.env.DB;
  const shop = await shopBySlug(db, c.req.param("slug"));
  const barberId = await defaultBarberId(db, shop.id);
  const [services, hours, breaks, gallery] = await Promise.all([
    listServices(db, shop.id, true),
    weeklyHours(db, barberId),
    listBreaks(db, barberId),
    listGallery(db, shop.id),
  ]);
  const body: PublicShopDto = {
    slug: shop.slug,
    name: shop.name,
    tagline: shop.tagline,
    about: shop.about,
    area: shop.area,
    address: shop.address,
    map_url: shop.map_url,
    phone: shop.phone,
    whatsapp: shop.whatsapp,
    accent: shop.accent,
    logo_url: imageUrl(shop.logo_key),
    cover_url: imageUrl(shop.cover_key),
    currency: shop.currency,
    timezone: shop.timezone,
    today: nowInZone(shop.timezone).date,
    booking_days_ahead: shop.booking_days_ahead,
    services,
    hours,
    breaks,
    gallery,
  };
  return c.json(body);
});

publicRoutes.get("/shops/:slug/slots", async (c) => {
  const db = c.env.DB;
  const shop = await shopBySlug(db, c.req.param("slug"));
  const date = c.req.query("date") ?? "";
  const now = nowInZone(shop.timezone);
  checkBookableDate(shop, date, now.date);
  const { duration } = await pickServices(db, shop.id, idList(c.req.query("services"), "service"));
  const barberId = await defaultBarberId(db, shop.id);
  const day = await loadDay(db, shop, barberId, date, { nowMin: date === now.date ? now.min : undefined });
  if (date === now.date) day.input.earliestStart = onlineEarliest(shop, now.min);
  const body: SlotsDto = {
    date,
    closed: !day.hours,
    duration_min: duration,
    slots: computeSlots(day.input, duration),
    breaks: day.breaks,
    hours: day.hours ? { open_min: day.hours.open, close_min: day.hours.close } : null,
  };
  return c.json(body);
});

/** Lets a returning customer skip typing their name. Returns the first name only. */
publicRoutes.get("/shops/:slug/customer", async (c) => {
  const db = c.env.DB;
  const shop = await shopBySlug(db, c.req.param("slug"));
  const phone = c.req.query("phone") ?? "";
  if (!isE164(phone)) return c.json({ known: false });
  const row = await db
    .prepare("SELECT name, whatsapp FROM customers WHERE shop_id = ? AND phone = ?")
    .bind(shop.id, phone)
    .first<{ name: string; whatsapp: string | null }>();
  if (!row || !row.name) return c.json({ known: false });
  return c.json({ known: true, first_name: row.name.split(/\s+/)[0], has_whatsapp: !!row.whatsapp });
});

publicRoutes.post("/shops/:slug/bookings", async (c) => {
  const db = c.env.DB;
  const shop = await shopBySlug(db, c.req.param("slug"));
  const body = await readJson(c.req.raw);
  const now = nowInZone(shop.timezone);

  const date = str(body.date, "Date", 10);
  checkBookableDate(shop, date, now.date);
  const startMin = int(body.start_min, "Time", 0, 1439);
  const phone = str(body.phone, "Mobile number", 20);
  if (!isE164(phone)) throw bad("Check the mobile number");
  const name = str(body.name, "Name", 60, { required: false });
  const whatsappRaw = str(body.whatsapp, "WhatsApp number", 20, { required: false });
  if (whatsappRaw && !isE164(whatsappRaw)) throw bad("Check the WhatsApp number");
  const { services, duration, price } = await pickServices(db, shop.id, idList(body.service_ids, "service"));

  const existing = await db
    .prepare("SELECT id, name FROM customers WHERE shop_id = ? AND phone = ?")
    .bind(shop.id, phone)
    .first<{ id: number; name: string }>();
  if (!name && !existing?.name) throw bad("Name is required");

  // Simple abuse guard: a number can't hold more than 3 upcoming requests.
  if (existing) {
    const open = await db
      .prepare("SELECT COUNT(*) AS n FROM bookings WHERE customer_id = ? AND status = 'pending' AND date >= ?")
      .bind(existing.id, now.date)
      .first<{ n: number }>();
    if ((open?.n ?? 0) >= 3) throw new HttpError(429, `You already have 3 requests waiting. Please wait for ${shop.name} to reply.`);
  }

  const barberId = await defaultBarberId(db, shop.id);
  const day = await loadDay(db, shop, barberId, date, { nowMin: date === now.date ? now.min : undefined });
  if (date === now.date) day.input.earliestStart = onlineEarliest(shop, now.min);
  const why = conflictAt(day.input, startMin, duration);
  if (why) throw new HttpError(409, why === "booked" ? "Sorry, that time was just taken. Please pick another." : "That time isn't available");

  const customerId = await upsertCustomer(db, shop.id, phone, name, whatsappRaw || null);
  const token = randomToken(12);
  await insertBooking(db, {
    shopId: shop.id,
    barberId,
    customerId,
    date,
    startMin,
    duration,
    price,
    status: "pending",
    source: "online",
    token,
    services,
  });
  return c.json({ token }, 201);
});

async function bookingByToken(db: D1Database, token: string) {
  const row = await db
    .prepare(
      `SELECT b.*, c.name AS customer_name, c.phone AS customer_phone, c.whatsapp AS customer_whatsapp
       FROM bookings b LEFT JOIN customers c ON c.id = b.customer_id WHERE b.token = ?`
    )
    .bind(token)
    .first<{
      id: number;
      shop_id: number;
      token: string;
      status: PublicBookingDto["status"];
      date: string;
      start_min: number;
      duration_min: number;
      price_total: number;
      customer_name: string | null;
      customer_phone: string | null;
      customer_whatsapp: string | null;
    }>();
  if (!row) throw notFound("Booking not found");
  const shop = await db.prepare("SELECT * FROM shops WHERE id = ?").bind(row.shop_id).first<ShopRow>();
  if (!shop) throw notFound("Booking not found");
  return { row, shop };
}

function canChange(shop: ShopRow, row: { status: string; date: string; start_min: number }) {
  if (row.status !== "pending" && row.status !== "confirmed") return false;
  return minutesUntil(nowInZone(shop.timezone), row.date, row.start_min) >= shop.change_cutoff_min;
}

publicRoutes.get("/bookings/:token", async (c) => {
  const db = c.env.DB;
  const { row, shop } = await bookingByToken(db, c.req.param("token"));
  const { results: services } = await db
    .prepare("SELECT service_id, name, duration_min, price FROM booking_services WHERE booking_id = ?")
    .bind(row.id)
    .all<PublicBookingDto["services"][number]>();
  const body: PublicBookingDto = {
    token: row.token,
    status: row.status,
    date: row.date,
    start_min: row.start_min,
    duration_min: row.duration_min,
    price_total: row.price_total,
    services,
    customer_name: (row.customer_name ?? "").split(/\s+/)[0],
    whatsapp: row.customer_whatsapp ?? row.customer_phone,
    can_change: canChange(shop, row),
    change_cutoff_min: shop.change_cutoff_min,
    shop: {
      slug: shop.slug,
      name: shop.name,
      address: shop.address,
      map_url: shop.map_url,
      phone: shop.phone,
      whatsapp: shop.whatsapp,
      accent: shop.accent,
      currency: shop.currency,
      timezone: shop.timezone,
      logo_url: imageUrl(shop.logo_key),
    },
  };
  return c.json(body);
});

publicRoutes.post("/bookings/:token/cancel", async (c) => {
  const db = c.env.DB;
  const { row, shop } = await bookingByToken(db, c.req.param("token"));
  if (!canChange(shop, row)) {
    throw new HttpError(409, `This booking can't be cancelled online anymore. Please message ${shop.name} directly.`);
  }
  await db.prepare("UPDATE bookings SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(nowIso(), row.id).run();
  return c.json({ ok: true });
});
