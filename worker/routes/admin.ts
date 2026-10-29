// Barber/owner API. Everything is scoped to the logged-in user's shop.
import { Hono } from "hono";
import type { AppEnv, ShopRow } from "../env";
import { conflictAt, freeMinutesFrom } from "../../shared/slots";
import { isDateString, nowInZone, addDays } from "../../shared/time";
import { isE164 } from "../../shared/phone";
import type { AdminShopDto, BookingStatus, TodayDto } from "../../shared/types";
import { requireShopUser } from "../lib/auth";
import {
  customerDto,
  imageUrl,
  insertBooking,
  listBreaks,
  listGallery,
  listServices,
  loadDay,
  pickServices,
  queryBookings,
  settingsOf,
  upsertCustomer,
  weeklyHours,
} from "../lib/data";
import { HttpError, bad, bool, idList, int, isHexColor, notFound, num, nowIso, randomToken, readJson, str } from "../lib/util";

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use("*", requireShopUser);

const today = (shop: ShopRow) => nowInZone(shop.timezone);

// ---------- Today ----------

adminRoutes.get("/today", async (c) => {
  const db = c.env.DB;
  const shop = c.get("shop");
  const barberId = c.get("barberId");
  const now = today(shop);
  const date = c.req.query("date") || now.date;
  if (!isDateString(date)) throw bad("Invalid date");
  const [day, bookings, requests] = await Promise.all([
    loadDay(db, shop, barberId, date),
    queryBookings(db, "b.barber_id = ? AND b.date = ? AND b.status NOT IN ('declined','cancelled') ORDER BY b.start_min", [
      barberId,
      date,
    ]),
    queryBookings(db, "b.barber_id = ? AND b.status = 'pending' AND b.date >= ? ORDER BY b.date, b.start_min", [barberId, now.date]),
  ]);
  const body: TodayDto = {
    date,
    now_min: now.min,
    now_date: now.date,
    settings: settingsOf(shop),
    hours: day.hours ? { open_min: day.hours.open, close_min: day.hours.close } : null,
    breaks: day.breaks,
    time_off: day.timeOff,
    bookings,
    requests,
  };
  return c.json(body);
});

adminRoutes.get("/bookings/:id", async (c) => {
  const id = int(c.req.param("id"), "id", 1);
  const [b] = await queryBookings(c.env.DB, "b.id = ? AND b.shop_id = ?", [id, c.get("shop").id]);
  if (!b) throw notFound("Booking not found");
  return c.json(b);
});

/** Allowed status changes: action -> [from statuses, to status]. */
const TRANSITIONS: Record<string, [BookingStatus[], BookingStatus]> = {
  confirm: [["pending"], "confirmed"],
  decline: [["pending"], "declined"],
  cancel: [["pending", "confirmed"], "cancelled"],
  start: [["pending", "confirmed"], "in_progress"],
  finish: [["in_progress"], "done"],
  noshow: [["pending", "confirmed"], "no_show"],
  undo_noshow: [["no_show"], "confirmed"],
};

adminRoutes.post("/bookings/:id/:action", async (c) => {
  const db = c.env.DB;
  const shop = c.get("shop");
  const id = int(c.req.param("id"), "id", 1);
  const action = c.req.param("action");
  const row = await db
    .prepare("SELECT id, status, barber_id, date FROM bookings WHERE id = ? AND shop_id = ?")
    .bind(id, shop.id)
    .first<{ id: number; status: BookingStatus; barber_id: number; date: string }>();
  if (!row) throw notFound("Booking not found");
  const ts = nowIso();

  if (action === "reminder") {
    await db.prepare("UPDATE bookings SET reminder_sent_at = ?, updated_at = ? WHERE id = ?").bind(ts, ts, id).run();
  } else {
    const t = TRANSITIONS[action];
    if (!t) throw notFound("Unknown action");
    const [from, to] = t;
    if (!from.includes(row.status)) throw new HttpError(409, `This booking is ${row.status.replace("_", " ")}, so it can't be changed that way`);
    if (action === "start") {
      const running = await db
        .prepare("SELECT COUNT(*) AS n FROM bookings WHERE barber_id = ? AND status = 'in_progress' AND id <> ?")
        .bind(row.barber_id, id)
        .first<{ n: number }>();
      if ((running?.n ?? 0) > 0) throw new HttpError(409, "Finish the current visit first");
    }
    const extra =
      action === "confirm"
        ? ", confirmed_at = ?1"
        : action === "start"
          ? ", started_at = ?1, confirmed_at = COALESCE(confirmed_at, ?1)"
          : action === "finish"
            ? ", finished_at = ?1"
            : "";
    await db.prepare(`UPDATE bookings SET status = ?2, updated_at = ?1${extra} WHERE id = ?3`).bind(ts, to, id).run();
  }
  const [b] = await queryBookings(db, "b.id = ?", [id]);
  return c.json(b);
});

// ---------- Walk-ins ----------

adminRoutes.post("/walkins", async (c) => {
  const db = c.env.DB;
  const shop = c.get("shop");
  const barberId = c.get("barberId");
  const body = await readJson(c.req.raw);
  const now = today(shop);
  const { services, duration, price } = await pickServices(db, shop.id, idList(body.service_ids, "service"));
  const phone = str(body.phone, "Mobile number", 20, { required: false });
  if (phone && !isE164(phone)) throw bad("Check the mobile number");
  const name = str(body.name, "Name", 60, { required: false });
  const startNow = bool(body.start_now);

  let customerId: number;
  if (phone) {
    customerId = await upsertCustomer(db, shop.id, phone, name, null);
  } else {
    const row = await db
      .prepare("INSERT INTO customers (shop_id, phone, name, is_guest) VALUES (?, NULL, ?, 1) RETURNING id")
      .bind(shop.id, name || "Guest")
      .first<{ id: number }>();
    customerId = row!.id;
  }

  const day = await loadDay(db, shop, barberId, now.date, { nowMin: now.min });
  let startMin = now.min;
  if (startNow) {
    const running = await db
      .prepare("SELECT COUNT(*) AS n FROM bookings WHERE barber_id = ? AND status = 'in_progress'")
      .bind(barberId)
      .first<{ n: number }>();
    if ((running?.n ?? 0) > 0) throw new HttpError(409, "Finish the current visit first, or add them to the queue");
  } else {
    // Next time from now (in 5-minute steps) where the visit fits, ignoring opening hours.
    let found: number | null = null;
    for (let m = Math.ceil(now.min / 5) * 5; m + duration <= 1440; m += 5) {
      if (conflictAt(day.input, m, duration, { ignoreHours: true }) === null) {
        found = m;
        break;
      }
    }
    if (found === null) throw new HttpError(409, "There's no free time left today for this visit");
    startMin = found;
  }
  const ts = nowIso();
  const id = await insertBooking(db, {
    shopId: shop.id,
    barberId,
    customerId,
    date: now.date,
    startMin,
    duration,
    price,
    status: startNow ? "in_progress" : "confirmed",
    source: "walkin",
    token: randomToken(12),
    startedAt: startNow ? ts : null,
    confirmedAt: ts,
    services,
  });
  const [b] = await queryBookings(db, "b.id = ?", [id]);
  return c.json(b, 201);
});

/** How long is free from now (for the walk-in screen). */
adminRoutes.get("/free-now", async (c) => {
  const shop = c.get("shop");
  const now = today(shop);
  const day = await loadDay(c.env.DB, shop, c.get("barberId"), now.date, { nowMin: now.min });
  return c.json({ free_min: freeMinutesFrom(day.input, now.min), buffer_min: shop.buffer_min });
});

// ---------- Services ----------

adminRoutes.get("/services", async (c) => c.json(await listServices(c.env.DB, c.get("shop").id, false)));

function serviceFields(body: Record<string, unknown>) {
  return {
    name: str(body.name, "Name", 60),
    duration: int(body.duration_min, "Duration", 5, 480),
    price: num(body.price, "Price", 0, 100000),
    active: body.active === undefined ? true : bool(body.active),
  };
}

adminRoutes.post("/services", async (c) => {
  const db = c.env.DB;
  const shop = c.get("shop");
  const f = serviceFields(await readJson(c.req.raw));
  const max = await db.prepare("SELECT COALESCE(MAX(sort), 0) AS m FROM services WHERE shop_id = ?").bind(shop.id).first<{ m: number }>();
  await db
    .prepare("INSERT INTO services (shop_id, name, duration_min, price, active, sort) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(shop.id, f.name, f.duration, f.price, f.active ? 1 : 0, (max?.m ?? 0) + 1)
    .run();
  return c.json(await listServices(db, shop.id, false), 201);
});

adminRoutes.put("/services/:id", async (c) => {
  const db = c.env.DB;
  const shop = c.get("shop");
  const f = serviceFields(await readJson(c.req.raw));
  const res = await db
    .prepare("UPDATE services SET name = ?, duration_min = ?, price = ?, active = ? WHERE id = ? AND shop_id = ? AND deleted = 0")
    .bind(f.name, f.duration, f.price, f.active ? 1 : 0, int(c.req.param("id"), "id", 1), shop.id)
    .run();
  if (!res.meta.changes) throw notFound("Service not found");
  return c.json(await listServices(db, shop.id, false));
});

adminRoutes.delete("/services/:id", async (c) => {
  const db = c.env.DB;
  const shop = c.get("shop");
  await db.prepare("UPDATE services SET deleted = 1, active = 0 WHERE id = ? AND shop_id = ?").bind(int(c.req.param("id"), "id", 1), shop.id).run();
  return c.json(await listServices(db, shop.id, false));
});

// ---------- Hours, breaks, time off, rules ----------

adminRoutes.get("/schedule", async (c) => {
  const db = c.env.DB;
  const shop = c.get("shop");
  const barberId = c.get("barberId");
  const now = today(shop);
  const [hours, breaks, timeOff] = await Promise.all([
    weeklyHours(db, barberId),
    listBreaks(db, barberId),
    db
      .prepare("SELECT id, date, start_min, end_min, reason FROM time_off WHERE barber_id = ? AND date >= ? ORDER BY date, start_min")
      .bind(barberId, now.date)
      .all(),
  ]);
  return c.json({ hours, breaks, time_off: timeOff.results, settings: settingsOf(shop), today: now.date, now_min: now.min });
});

adminRoutes.put("/hours", async (c) => {
  const db = c.env.DB;
  const shop = c.get("shop");
  const barberId = c.get("barberId");
  const body = await readJson(c.req.raw);
  if (!Array.isArray(body.days) || body.days.length !== 7) throw bad("Send all 7 days");
  const stmts = (body.days as Record<string, unknown>[]).map((d) => {
    const weekday = int(d.weekday, "weekday", 0, 6);
    const open = int(d.open_min, "Opening time", 0, 1440);
    const close = int(d.close_min, "Closing time", 0, 1440);
    const closed = bool(d.closed);
    if (!closed && close <= open) throw bad("Closing time must be after opening time");
    return db
      .prepare(
        `INSERT INTO working_hours (barber_id, shop_id, weekday, open_min, close_min, closed) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (barber_id, weekday) DO UPDATE SET open_min = excluded.open_min, close_min = excluded.close_min, closed = excluded.closed`
      )
      .bind(barberId, shop.id, weekday, open, close, closed ? 1 : 0);
  });
  await db.batch(stmts);
  return c.json(await weeklyHours(db, barberId));
});

function breakFields(body: Record<string, unknown>) {
  const start = int(body.start_min, "Start", 0, 1440);
  const end = int(body.end_min, "End", 0, 1440);
  if (end <= start) throw bad("A break must end after it starts");
  const weekday = body.weekday === null || body.weekday === undefined || body.weekday === "" ? null : int(body.weekday, "Day", 0, 6);
  return { start, end, weekday, label: str(body.label, "Label", 40, { required: false }) || "Break" };
}

adminRoutes.post("/breaks", async (c) => {
  const db = c.env.DB;
  const f = breakFields(await readJson(c.req.raw));
  await db
    .prepare("INSERT INTO breaks (shop_id, barber_id, weekday, start_min, end_min, label) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(c.get("shop").id, c.get("barberId"), f.weekday, f.start, f.end, f.label)
    .run();
  return c.json(await listBreaks(db, c.get("barberId")), 201);
});

adminRoutes.put("/breaks/:id", async (c) => {
  const db = c.env.DB;
  const f = breakFields(await readJson(c.req.raw));
  await db
    .prepare("UPDATE breaks SET weekday = ?, start_min = ?, end_min = ?, label = ? WHERE id = ? AND barber_id = ?")
    .bind(f.weekday, f.start, f.end, f.label, int(c.req.param("id"), "id", 1), c.get("barberId"))
    .run();
  return c.json(await listBreaks(db, c.get("barberId")));
});

adminRoutes.delete("/breaks/:id", async (c) => {
  const db = c.env.DB;
  await db.prepare("DELETE FROM breaks WHERE id = ? AND barber_id = ?").bind(int(c.req.param("id"), "id", 1), c.get("barberId")).run();
  return c.json(await listBreaks(db, c.get("barberId")));
});

adminRoutes.post("/time-off", async (c) => {
  const body = await readJson(c.req.raw);
  const date = str(body.date, "Date", 10);
  if (!isDateString(date)) throw bad("Pick a valid date");
  const allDay = bool(body.all_day);
  const start = allDay ? 0 : int(body.start_min, "Start", 0, 1440);
  const end = allDay ? 1440 : int(body.end_min, "End", 0, 1440);
  if (end <= start) throw bad("Time off must end after it starts");
  await c.env.DB.prepare("INSERT INTO time_off (shop_id, barber_id, date, start_min, end_min, reason) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(c.get("shop").id, c.get("barberId"), date, start, end, str(body.reason, "Reason", 80, { required: false }))
    .run();
  return c.json({ ok: true }, 201);
});

/** Quick break: blocks the next N minutes from now. */
adminRoutes.post("/quick-break", async (c) => {
  const body = await readJson(c.req.raw);
  const minutes = int(body.minutes, "Minutes", 5, 240);
  const now = today(c.get("shop"));
  await c.env.DB.prepare("INSERT INTO time_off (shop_id, barber_id, date, start_min, end_min, reason) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(c.get("shop").id, c.get("barberId"), now.date, now.min, Math.min(1440, now.min + minutes), "Quick break")
    .run();
  return c.json({ ok: true }, 201);
});

adminRoutes.delete("/time-off/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM time_off WHERE id = ? AND barber_id = ?").bind(int(c.req.param("id"), "id", 1), c.get("barberId")).run();
  return c.json({ ok: true });
});

adminRoutes.put("/settings", async (c) => {
  const db = c.env.DB;
  const shop = c.get("shop");
  const b = await readJson(c.req.raw);
  const s = {
    slot_step_min: int(b.slot_step_min ?? shop.slot_step_min, "Slot step", 5, 120),
    buffer_min: int(b.buffer_min ?? shop.buffer_min, "Buffer", 0, 60),
    grace_min: int(b.grace_min ?? shop.grace_min, "Grace period", 0, 60),
    reminder_min: int(b.reminder_min ?? shop.reminder_min, "Reminder", 0, 1440),
    reopen_min: int(b.reopen_min ?? shop.reopen_min, "Reopen", 0, 240),
    change_cutoff_min: int(b.change_cutoff_min ?? shop.change_cutoff_min, "Change cutoff", 0, 2880),
    min_notice_min: int(b.min_notice_min ?? shop.min_notice_min, "Minimum notice", 0, 1440),
    booking_days_ahead: int(b.booking_days_ahead ?? shop.booking_days_ahead, "Days ahead", 1, 90),
  };
  await db
    .prepare(
      `UPDATE shops SET slot_step_min = ?, buffer_min = ?, grace_min = ?, reminder_min = ?, reopen_min = ?,
       change_cutoff_min = ?, min_notice_min = ?, booking_days_ahead = ? WHERE id = ?`
    )
    .bind(s.slot_step_min, s.buffer_min, s.grace_min, s.reminder_min, s.reopen_min, s.change_cutoff_min, s.min_notice_min, s.booking_days_ahead, shop.id)
    .run();
  return c.json(s);
});

// ---------- Customers ----------

adminRoutes.get("/customers", async (c) => {
  const shop = c.get("shop");
  const q = (c.req.query("q") ?? "").trim();
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const digits = q.replace(/\D/g, "");
  const { results } = await c.env.DB.prepare(
    `SELECT c.*,
       (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = c.id AND b.status = 'done') AS visits,
       (SELECT MAX(b.date) FROM bookings b WHERE b.customer_id = c.id AND b.status = 'done') AS last_visit
     FROM customers c
     WHERE c.shop_id = ? AND (c.is_guest = 0 OR ? = 1)
       AND (? = '' OR c.name LIKE ? OR (? <> '' AND c.phone LIKE ?))
     ORDER BY last_visit IS NULL, last_visit DESC, c.created_at DESC LIMIT 200`
  )
    .bind(shop.id, c.req.query("guests") === "1" ? 1 : 0, q, like, digits, `%${digits}%`)
    .all<any>();
  return c.json(results.map((r) => ({ ...customerDto(r), visits: r.visits, last_visit: r.last_visit })));
});

adminRoutes.get("/customers/:id", async (c) => {
  const db = c.env.DB;
  const shop = c.get("shop");
  const id = int(c.req.param("id"), "id", 1);
  const row = await db.prepare("SELECT * FROM customers WHERE id = ? AND shop_id = ?").bind(id, shop.id).first<any>();
  if (!row) throw notFound("Customer not found");
  const history = await queryBookings(db, "b.customer_id = ? ORDER BY b.date DESC, b.start_min DESC LIMIT 100", [id]);
  return c.json({ customer: customerDto(row), history });
});

adminRoutes.put("/customers/:id", async (c) => {
  const db = c.env.DB;
  const shop = c.get("shop");
  const id = int(c.req.param("id"), "id", 1);
  const body = await readJson(c.req.raw);
  const name = str(body.name, "Name", 60, { required: false });
  const phone = str(body.phone, "Mobile number", 20, { required: false });
  const whatsapp = str(body.whatsapp, "WhatsApp number", 20, { required: false });
  if (phone && !isE164(phone)) throw bad("Check the mobile number");
  if (whatsapp && !isE164(whatsapp)) throw bad("Check the WhatsApp number");
  const prefs = Array.isArray(body.prefs) ? body.prefs.map((p) => str(p, "Preference", 40)).filter(Boolean).slice(0, 20) : [];
  const notes = str(body.notes, "Notes", 2000, { required: false });
  if (phone) {
    const clash = await db
      .prepare("SELECT id FROM customers WHERE shop_id = ? AND phone = ? AND id <> ?")
      .bind(shop.id, phone, id)
      .first();
    if (clash) throw new HttpError(409, "Another customer already has this number");
  }
  const res = await db
    .prepare("UPDATE customers SET name = ?, phone = ?, whatsapp = ?, prefs = ?, notes = ?, is_guest = ? WHERE id = ? AND shop_id = ?")
    .bind(name, phone || null, whatsapp && whatsapp !== phone ? whatsapp : null, JSON.stringify(prefs), notes, phone ? 0 : 1, id, shop.id)
    .run();
  if (!res.meta.changes) throw notFound("Customer not found");
  const row = await db.prepare("SELECT * FROM customers WHERE id = ?").bind(id).first<any>();
  return c.json(customerDto(row));
});

// ---------- Shop page & images ----------

async function shopDto(db: D1Database, shop: ShopRow): Promise<AdminShopDto> {
  return {
    ...settingsOf(shop),
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
    gallery: await listGallery(db, shop.id),
  };
}

adminRoutes.get("/shop", async (c) => c.json(await shopDto(c.env.DB, c.get("shop"))));

adminRoutes.put("/shop", async (c) => {
  const db = c.env.DB;
  const shop = c.get("shop");
  const b = await readJson(c.req.raw);
  const phone = str(b.phone, "Phone", 20, { required: false });
  const whatsapp = str(b.whatsapp, "WhatsApp", 20, { required: false });
  if (phone && !isE164(phone)) throw bad("Check the shop phone number");
  if (whatsapp && !isE164(whatsapp)) throw bad("Check the shop WhatsApp number");
  const accent = str(b.accent, "Colour", 7);
  if (!isHexColor(accent)) throw bad("Pick a colour");
  const mapUrl = str(b.map_url, "Map link", 500, { required: false });
  if (mapUrl && !/^https:\/\//.test(mapUrl)) throw bad("The map link should start with https://");
  await db
    .prepare("UPDATE shops SET name = ?, tagline = ?, about = ?, area = ?, address = ?, map_url = ?, phone = ?, whatsapp = ?, accent = ? WHERE id = ?")
    .bind(
      str(b.name, "Shop name", 80),
      str(b.tagline, "Tagline", 120, { required: false }),
      str(b.about, "About", 600, { required: false }),
      str(b.area, "Area", 60, { required: false }),
      str(b.address, "Address", 200, { required: false }),
      mapUrl,
      phone,
      whatsapp,
      accent,
      shop.id
    )
    .run();
  const fresh = await db.prepare("SELECT * FROM shops WHERE id = ?").bind(shop.id).first<ShopRow>();
  return c.json(await shopDto(db, fresh!));
});

const IMAGE_TYPES: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

/** Upload a cover, logo or gallery image. The browser resizes images before sending. */
adminRoutes.post("/images", async (c) => {
  const db = c.env.DB;
  const shop = c.get("shop");
  const kind = c.req.query("kind");
  if (kind !== "cover" && kind !== "logo" && kind !== "gallery") throw bad("Unknown image kind");
  const type = (c.req.header("content-type") ?? "").split(";")[0];
  const ext = IMAGE_TYPES[type];
  if (!ext) throw new HttpError(415, "Upload a JPG, PNG or WebP image");
  const data = await c.req.arrayBuffer();
  if (data.byteLength === 0) throw bad("The image is empty");
  if (data.byteLength > 5 * 1024 * 1024) throw new HttpError(413, "The image is too large (5 MB max)");
  const key = `shops/${shop.id}/${kind}-${randomToken(9)}.${ext}`;
  await c.env.IMAGES.put(key, data, { httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" } });

  if (kind === "gallery") {
    const count = await db.prepare("SELECT COUNT(*) AS n FROM gallery WHERE shop_id = ?").bind(shop.id).first<{ n: number }>();
    if ((count?.n ?? 0) >= 30) {
      await c.env.IMAGES.delete(key);
      throw bad("The gallery is full (30 photos). Remove one first.");
    }
    await db
      .prepare("INSERT INTO gallery (shop_id, image_key, sort) VALUES (?, ?, ?)")
      .bind(shop.id, key, (count?.n ?? 0) + 1)
      .run();
  } else {
    const column = kind === "cover" ? "cover_key" : "logo_key";
    const old = kind === "cover" ? shop.cover_key : shop.logo_key;
    await db.prepare(`UPDATE shops SET ${column} = ? WHERE id = ?`).bind(key, shop.id).run();
    if (old) await c.env.IMAGES.delete(old);
  }
  const fresh = await db.prepare("SELECT * FROM shops WHERE id = ?").bind(shop.id).first<ShopRow>();
  return c.json(await shopDto(db, fresh!), 201);
});

adminRoutes.delete("/images/:kind", async (c) => {
  const db = c.env.DB;
  const shop = c.get("shop");
  const kind = c.req.param("kind");
  if (kind !== "cover" && kind !== "logo") throw bad("Unknown image kind");
  const old = kind === "cover" ? shop.cover_key : shop.logo_key;
  await db.prepare(`UPDATE shops SET ${kind === "cover" ? "cover_key" : "logo_key"} = NULL WHERE id = ?`).bind(shop.id).run();
  if (old) await c.env.IMAGES.delete(old);
  const fresh = await db.prepare("SELECT * FROM shops WHERE id = ?").bind(shop.id).first<ShopRow>();
  return c.json(await shopDto(db, fresh!));
});

adminRoutes.delete("/gallery/:id", async (c) => {
  const db = c.env.DB;
  const shop = c.get("shop");
  const row = await db
    .prepare("SELECT image_key FROM gallery WHERE id = ? AND shop_id = ?")
    .bind(int(c.req.param("id"), "id", 1), shop.id)
    .first<{ image_key: string }>();
  if (row) {
    await db.prepare("DELETE FROM gallery WHERE id = ? AND shop_id = ?").bind(c.req.param("id"), shop.id).run();
    await c.env.IMAGES.delete(row.image_key);
  }
  return c.json(await shopDto(db, shop));
});

// ---------- Upcoming (next few days, for the schedule) ----------

adminRoutes.get("/upcoming", async (c) => {
  const shop = c.get("shop");
  const now = today(shop);
  const bookings = await queryBookings(
    c.env.DB,
    "b.barber_id = ? AND b.date > ? AND b.date <= ? AND b.status IN ('pending','confirmed') ORDER BY b.date, b.start_min",
    [c.get("barberId"), now.date, addDays(now.date, 14)]
  );
  return c.json(bookings);
});
