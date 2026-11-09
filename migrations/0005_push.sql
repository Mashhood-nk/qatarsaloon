-- Phones/browsers that turned on notifications. One row per device.
CREATE TABLE push_subscriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  shop_id     INTEGER NOT NULL REFERENCES shops(id),
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_ok_at  TEXT
);
CREATE INDEX push_subscriptions_shop ON push_subscriptions(shop_id);
CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);

-- When the "send a reminder" nudge was pushed, so it's sent only once.
ALTER TABLE bookings ADD COLUMN reminder_notified_at TEXT;
