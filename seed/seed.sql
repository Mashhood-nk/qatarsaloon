-- Starting data for Ashique's shop. Everything here is editable later from the admin.
-- Prices for colouring/straightening are placeholders.

INSERT INTO shops (slug, name, tagline, about, area, accent)
VALUES (
  'ashique',
  'Ashique''s Barber Studio',
  'Precise cuts. Unhurried service.',
  'Choose your services and a time that suits you. Ashique confirms every booking personally on WhatsApp.',
  'Doha',
  '#3F4A2E'
);

INSERT INTO barbers (shop_id, name, sort)
VALUES ((SELECT id FROM shops WHERE slug = 'ashique'), 'Ashique', 0);

INSERT INTO services (shop_id, name, duration_min, price, sort) VALUES
  ((SELECT id FROM shops WHERE slug = 'ashique'), 'Haircut', 30, 20, 1),
  ((SELECT id FROM shops WHERE slug = 'ashique'), 'Beard styling', 30, 20, 2),
  ((SELECT id FROM shops WHERE slug = 'ashique'), 'Hair colouring', 60, 50, 3),
  ((SELECT id FROM shops WHERE slug = 'ashique'), 'Beard colouring', 30, 30, 4),
  ((SELECT id FROM shops WHERE slug = 'ashique'), 'Hair straightening', 90, 100, 5);

-- 10:00-22:00 every day; Friday (weekday 5) opens at 16:00 (first half off).
-- weekday: 0 = Sunday ... 6 = Saturday; times are minutes since midnight.
INSERT INTO working_hours (barber_id, shop_id, weekday, open_min, close_min, closed) VALUES
  ((SELECT b.id FROM barbers b JOIN shops s ON s.id = b.shop_id WHERE s.slug = 'ashique'), (SELECT id FROM shops WHERE slug = 'ashique'), 0, 600, 1320, 0),
  ((SELECT b.id FROM barbers b JOIN shops s ON s.id = b.shop_id WHERE s.slug = 'ashique'), (SELECT id FROM shops WHERE slug = 'ashique'), 1, 600, 1320, 0),
  ((SELECT b.id FROM barbers b JOIN shops s ON s.id = b.shop_id WHERE s.slug = 'ashique'), (SELECT id FROM shops WHERE slug = 'ashique'), 2, 600, 1320, 0),
  ((SELECT b.id FROM barbers b JOIN shops s ON s.id = b.shop_id WHERE s.slug = 'ashique'), (SELECT id FROM shops WHERE slug = 'ashique'), 3, 600, 1320, 0),
  ((SELECT b.id FROM barbers b JOIN shops s ON s.id = b.shop_id WHERE s.slug = 'ashique'), (SELECT id FROM shops WHERE slug = 'ashique'), 4, 600, 1320, 0),
  ((SELECT b.id FROM barbers b JOIN shops s ON s.id = b.shop_id WHERE s.slug = 'ashique'), (SELECT id FROM shops WHERE slug = 'ashique'), 5, 960, 1320, 0),
  ((SELECT b.id FROM barbers b JOIN shops s ON s.id = b.shop_id WHERE s.slug = 'ashique'), (SELECT id FROM shops WHERE slug = 'ashique'), 6, 600, 1320, 0);

-- Daily lunch break 14:00-15:00 (placeholder).
INSERT INTO breaks (shop_id, barber_id, weekday, start_min, end_min, label) VALUES
  ((SELECT id FROM shops WHERE slug = 'ashique'),
   (SELECT b.id FROM barbers b JOIN shops s ON s.id = b.shop_id WHERE s.slug = 'ashique'),
   NULL, 840, 900, 'Lunch');
