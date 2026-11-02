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
  plan: string;
  plan_expires_at: string | null;
  notes: string;
  created_at: string;
}

export type Role = "platform" | "owner" | "barber";

export interface UserRow {
  id: number;
  shop_id: number | null;
  barber_id: number | null;
  username: string;
  name: string;
  role: Role;
  active: number;
  /** Set when a platform admin has opened a shop's admin. */
  acting_shop_id: number | null;
  /** Hash of the session cookie, to update the session. */
  session_hash: string;
}

export interface BarberRow {
  id: number;
  shop_id: number;
  name: string;
  active: number;
  sort: number;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: UserRow;
    shop: ShopRow;
    /** Role inside the shop: a platform admin viewing a shop acts as its owner. */
    role: "owner" | "barber";
    /** The logged-in person's own barber (null for a platform admin or an owner who doesn't cut). */
    ownBarberId: number | null;
    /** All barbers of the shop, active first. */
    barbers: BarberRow[];
    /** Barbers whose schedules this login may see and change. */
    allowedBarberIds: number[];
  };
};
