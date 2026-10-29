-- Multi-shop schema. Every shop-owned row carries shop_id so new shops are just new data.
-- Times of day are stored as minutes since midnight in the shop's local time zone,
-- dates as 'YYYY-MM-DD' in the shop's local time zone.

CREATE TABLE shops (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  slug                TEXT NOT NULL UNIQUE,          -- used in URLs: /<slug>
  name                TEXT NOT NULL,
  tagline             TEXT NOT NULL DEFAULT '',
  about               TEXT NOT NULL DEFAULT '',
  area                TEXT NOT NULL DEFAULT '',
  address             TEXT NOT NULL DEFAULT '',
  map_url             TEXT NOT NULL DEFAULT '',
  phone               TEXT NOT NULL DEFAULT '',      -- E.164, e.g. +97455000000
  whatsapp            TEXT NOT NULL DEFAULT '',      -- E.164
  accent              TEXT NOT NULL DEFAULT '#3F4A2E',
  logo_key            TEXT,
  cover_key           TEXT,
  timezone            TEXT NOT NULL DEFAULT 'Asia/Qatar',
  currency            TEXT NOT NULL DEFAULT 'QAR',
  slot_step_min       INTEGER NOT NULL DEFAULT 30,   -- how often a start time is offered
  buffer_min          INTEGER NOT NULL DEFAULT 5,    -- cleanup time after each visit
  grace_min           INTEGER NOT NULL DEFAULT 10,   -- before a booking counts as late
  reminder_min        INTEGER NOT NULL DEFAULT 60,   -- reminder lead time
  reopen_min          INTEGER NOT NULL DEFAULT 30,   -- freed slots reopen online if at least this far away
  change_cutoff_min   INTEGER NOT NULL DEFAULT 120,  -- customers can't change/cancel later than this
  min_notice_min      INTEGER NOT NULL DEFAULT 15,   -- earliest online booking from now
  booking_days_ahead  INTEGER NOT NULL DEFAULT 21,
  active              INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE barbers (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id   INTEGER NOT NULL REFERENCES shops(id),
  name      TEXT NOT NULL,
  active    INTEGER NOT NULL DEFAULT 1,
  sort      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX barbers_shop ON barbers(shop_id);

-- Logins. role: 'owner' (manages a shop), 'platform' (adds shops; shop_id NULL).
CREATE TABLE users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id        INTEGER REFERENCES shops(id),
  barber_id      INTEGER REFERENCES barbers(id),
  username       TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  password_hash  TEXT NOT NULL,                     -- pbkdf2$<iterations>$<salt b64>$<hash b64>
  role           TEXT NOT NULL DEFAULT 'owner',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,                     -- sha256 of the cookie token
  user_id     INTEGER NOT NULL REFERENCES users(id),
  expires_at  TEXT NOT NULL
);

CREATE TABLE services (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id       INTEGER NOT NULL REFERENCES shops(id),
  name          TEXT NOT NULL,
  duration_min  INTEGER NOT NULL,
  price         REAL NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,          -- shown on the booking page
  deleted       INTEGER NOT NULL DEFAULT 0,          -- soft delete keeps history intact
  sort          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX services_shop ON services(shop_id);

-- Weekly hours per barber. weekday: 0 = Sunday ... 6 = Saturday.
CREATE TABLE working_hours (
  barber_id  INTEGER NOT NULL REFERENCES barbers(id),
  shop_id    INTEGER NOT NULL REFERENCES shops(id),
  weekday    INTEGER NOT NULL,
  open_min   INTEGER NOT NULL,
  close_min  INTEGER NOT NULL,
  closed     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (barber_id, weekday)
);

-- Regular breaks. weekday NULL = every day.
CREATE TABLE breaks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id    INTEGER NOT NULL REFERENCES shops(id),
  barber_id  INTEGER NOT NULL REFERENCES barbers(id),
  weekday    INTEGER,
  start_min  INTEGER NOT NULL,
  end_min    INTEGER NOT NULL,
  label      TEXT NOT NULL DEFAULT 'Break'
);
CREATE INDEX breaks_barber ON breaks(barber_id);

-- One-off time off and quick breaks. A whole day is 0..1440.
CREATE TABLE time_off (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id    INTEGER NOT NULL REFERENCES shops(id),
  barber_id  INTEGER NOT NULL REFERENCES barbers(id),
  date       TEXT NOT NULL,
  start_min  INTEGER NOT NULL,
  end_min    INTEGER NOT NULL,
  reason     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX time_off_barber_date ON time_off(barber_id, date);

-- Customers: the mobile number is their identity within a shop.
CREATE TABLE customers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id     INTEGER NOT NULL REFERENCES shops(id),
  phone       TEXT,                                  -- E.164; NULL for guests
  name        TEXT NOT NULL DEFAULT '',
  whatsapp    TEXT,                                  -- E.164 when different from phone
  prefs       TEXT NOT NULL DEFAULT '[]',            -- JSON array of short preference tags
  notes       TEXT NOT NULL DEFAULT '',
  is_guest    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX customers_shop_phone ON customers(shop_id, phone) WHERE phone IS NOT NULL;

-- status: pending | confirmed | declined | cancelled | in_progress | done | no_show
-- source: online | walkin | admin
CREATE TABLE bookings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id           INTEGER NOT NULL REFERENCES shops(id),
  barber_id         INTEGER NOT NULL REFERENCES barbers(id),
  customer_id       INTEGER REFERENCES customers(id),
  date              TEXT NOT NULL,
  start_min         INTEGER NOT NULL,
  duration_min      INTEGER NOT NULL,
  price_total       REAL NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending',
  source            TEXT NOT NULL DEFAULT 'online',
  token             TEXT NOT NULL UNIQUE,            -- secret for the customer's manage link
  started_at        TEXT,                            -- ISO timestamps from Start/Finish taps
  finished_at       TEXT,
  reminder_sent_at  TEXT,
  confirmed_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX bookings_barber_date ON bookings(barber_id, date);
CREATE INDEX bookings_shop_status ON bookings(shop_id, status);
CREATE INDEX bookings_customer ON bookings(customer_id);

-- Services in a booking, copied at booking time so later price/name edits don't rewrite history.
CREATE TABLE booking_services (
  booking_id    INTEGER NOT NULL REFERENCES bookings(id),
  service_id    INTEGER NOT NULL REFERENCES services(id),
  name          TEXT NOT NULL,
  duration_min  INTEGER NOT NULL,
  price         REAL NOT NULL
);
CREATE INDEX booking_services_booking ON booking_services(booking_id);

CREATE TABLE gallery (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id    INTEGER NOT NULL REFERENCES shops(id),
  image_key  TEXT NOT NULL,
  caption    TEXT NOT NULL DEFAULT '',
  sort       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX gallery_shop ON gallery(shop_id);
