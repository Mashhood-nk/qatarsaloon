-- Who cancelled a booking ('customer' or 'shop'), when, and whether the barber has seen the alert.
ALTER TABLE bookings ADD COLUMN cancelled_by TEXT;
ALTER TABLE bookings ADD COLUMN cancelled_at TEXT;
ALTER TABLE bookings ADD COLUMN seen_at TEXT;
