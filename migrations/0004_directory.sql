-- Whether a shop appears in the public directory on the home page.
ALTER TABLE shops ADD COLUMN listed INTEGER NOT NULL DEFAULT 1;
