// Shapes the API returns. Shared by the Worker and the React app.

export type BookingStatus = "pending" | "confirmed" | "declined" | "cancelled" | "in_progress" | "done" | "no_show";
export type BookingSource = "online" | "walkin" | "admin";

/** Statuses that hold time in the schedule. */
export const BLOCKING_STATUSES: BookingStatus[] = ["pending", "confirmed", "in_progress"];

export interface ServiceDto {
  id: number;
  name: string;
  duration_min: number;
  price: number;
  active: boolean;
  sort: number;
}

export interface DayHoursDto {
  weekday: number;
  open_min: number;
  close_min: number;
  closed: boolean;
}

export interface BreakDto {
  id: number;
  weekday: number | null;
  start_min: number;
  end_min: number;
  label: string;
}

export interface TimeOffDto {
  id: number;
  date: string;
  start_min: number;
  end_min: number;
  reason: string;
}

export interface GalleryDto {
  id: number;
  url: string;
  caption: string;
}

export interface ShopSettings {
  slot_step_min: number;
  buffer_min: number;
  grace_min: number;
  reminder_min: number;
  reopen_min: number;
  change_cutoff_min: number;
  min_notice_min: number;
  booking_days_ahead: number;
}

export interface PublicShopDto {
  slug: string;
  barbers: { id: number; name: string }[];
  name: string;
  tagline: string;
  about: string;
  area: string;
  address: string;
  map_url: string;
  phone: string;
  whatsapp: string;
  accent: string;
  logo_url: string | null;
  cover_url: string | null;
  currency: string;
  timezone: string;
  today: string;
  booking_days_ahead: number;
  services: ServiceDto[];
  hours: DayHoursDto[];
  breaks: BreakDto[];
  gallery: GalleryDto[];
}

export interface SlotsDto {
  date: string;
  closed: boolean;
  duration_min: number;
  slots: { start: number; available: boolean }[];
  breaks: { start_min: number; end_min: number; label: string }[];
  hours: { open_min: number; close_min: number } | null;
}

export interface BookingServiceDto {
  service_id: number;
  name: string;
  duration_min: number;
  price: number;
}

export interface PublicBookingDto {
  token: string;
  barber_name: string;
  status: BookingStatus;
  date: string;
  start_min: number;
  duration_min: number;
  price_total: number;
  services: BookingServiceDto[];
  customer_name: string;
  whatsapp: string | null;
  can_change: boolean;
  change_cutoff_min: number;
  shop: {
    slug: string;
    name: string;
    address: string;
    map_url: string;
    phone: string;
    whatsapp: string;
    accent: string;
    currency: string;
    timezone: string;
    logo_url: string | null;
  };
}

export interface CustomerDto {
  id: number;
  phone: string | null;
  name: string;
  whatsapp: string | null;
  prefs: string[];
  notes: string;
  is_guest: boolean;
  created_at: string;
}

export interface AdminBookingDto {
  id: number;
  barber_id: number;
  barber_name: string;
  token: string;
  status: BookingStatus;
  source: BookingSource;
  date: string;
  start_min: number;
  duration_min: number;
  price_total: number;
  services: BookingServiceDto[];
  started_at: string | null;
  finished_at: string | null;
  reminder_sent_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  cancelled_by: "customer" | "shop" | null;
  cancelled_at: string | null;
  seen_at: string | null;
  customer: (CustomerDto & { visits: number; no_shows: number }) | null;
}

/** One barber's working day, for the Today schedule. */
export interface BarberDayDto {
  barber_id: number;
  barber_name: string;
  hours: { open_min: number; close_min: number } | null;
  breaks: { start_min: number; end_min: number; label: string }[];
  time_off: TimeOffDto[];
}

export interface TodayDto {
  date: string;
  now_min: number;
  now_date: string;
  settings: ShopSettings;
  /** The barbers shown (one, or all for an owner). */
  days: BarberDayDto[];
  bookings: AdminBookingDto[];
  requests: AdminBookingDto[];
  /** Customer cancellations the barber hasn't dismissed yet. */
  cancellations: AdminBookingDto[];
}

export type UserRole = "platform" | "owner" | "barber";

export interface BarberDto {
  id: number;
  name: string;
  active: boolean;
}

export interface MeDto {
  user: { id: number; username: string; name: string; role: UserRole };
  /** Role inside the current shop: a platform admin viewing a shop acts as owner. */
  shop_role: "owner" | "barber" | null;
  /** True when a platform admin is viewing a shop's admin. */
  acting: boolean;
  own_barber_id: number | null;
  barbers: BarberDto[];
  shop: {
    id: number;
    slug: string;
    name: string;
    accent: string;
    currency: string;
    timezone: string;
    whatsapp: string;
    address: string;
    grace_min: number;
  } | null;
}

export interface AdminShopDto extends ShopSettings {
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
  logo_url: string | null;
  cover_url: string | null;
  gallery: GalleryDto[];
}

export interface TeamMemberDto {
  id: number;
  name: string;
  active: boolean;
  /** Login for this barber, if they have one. */
  username: string | null;
  role: "owner" | "barber" | null;
  upcoming: number;
}

/** A shop card in the public directory on the home page. */
export interface DirectoryShopDto {
  slug: string;
  name: string;
  area: string;
  tagline: string;
  accent: string;
  cover_url: string | null;
  logo_url: string | null;
  barbers: number;
  /** Cheapest active service, for "from 20 QAR". */
  from_price: number | null;
  currency: string;
}

export interface PlatformShopDto {
  id: number;
  listed: boolean;
  slug: string;
  name: string;
  area: string;
  active: boolean;
  plan: string;
  plan_expires_at: string | null;
  notes: string;
  created_at: string;
  owner: { id: number; username: string; name: string } | null;
  barbers: number;
  bookings_30d: number;
  customers: number;
}
