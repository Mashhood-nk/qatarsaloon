export interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  ASSETS: Fetcher;
}

export interface ShopRow {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  about: string;
  area: string;
  address: string;
  map_url: string;
  phone: string;
  whatsapp: string;
  accent: string;
  logo_key: string | null;
  cover_key: string | null;
  timezone: string;
  currency: string;
  slot_step_min: number;
  buffer_min: number;
  grace_min: number;
  reminder_min: number;
  reopen_min: number;
  change_cutoff_min: number;
  min_notice_min: number;
  booking_days_ahead: number;
  active: number;
}

export interface UserRow {
  id: number;
  shop_id: number | null;
  barber_id: number | null;
  username: string;
  name: string;
  role: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { user: UserRow; shop: ShopRow; barberId: number };
};
