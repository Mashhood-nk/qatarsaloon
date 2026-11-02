-- Platform admin, shop owners and barbers.
-- users.role: 'platform' (manages all shops, shop_id NULL), 'owner' (whole shop), 'barber' (own schedule only).
ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1;

-- When the platform admin opens a shop's admin, the session remembers which shop.
ALTER TABLE sessions ADD COLUMN acting_shop_id INTEGER;

-- Subscription tracking for later (no payments yet).
ALTER TABLE shops ADD COLUMN plan TEXT NOT NULL DEFAULT 'beta';
ALTER TABLE shops ADD COLUMN plan_expires_at TEXT;
ALTER TABLE shops ADD COLUMN notes TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS users_shop ON users(shop_id);
