// Prefilled WhatsApp messages Ashique sends with one tap. Every message carries a link
// back to the site, because customers don't install anything.
import { fmtDateLong, fmtMin12 } from "../../shared/time";
import { waLink } from "../../shared/phone";
import { firstName, serviceNames } from "./format";
import type { AdminBookingDto } from "../../shared/types";

export interface ShopInfo {
  slug: string;
  name: string;
  address: string;
}

const origin = () => window.location.origin;
export const bookingLink = (token: string) => `${origin()}/b/${token}`;
export const shopBookLink = (slug: string) => `${origin()}/${slug}/book`;

/** Where to message a customer: their WhatsApp number if they gave one, else their mobile. */
export function customerWhatsApp(b: AdminBookingDto): string | null {
  return b.customer?.whatsapp ?? b.customer?.phone ?? null;
}

const hi = (b: AdminBookingDto) => {
  const n = firstName(b.customer?.name);
  return n && n !== "Guest" ? `Hi ${n}` : "Hi";
};

const dayRef = (b: AdminBookingDto, today: string) => (b.date === today ? "today" : `on ${fmtDateLong(b.date)}`);

export const messages = {
  confirm: (b: AdminBookingDto, shop: ShopInfo) =>
    `${hi(b)}, your ${serviceNames(b.services)} is confirmed for ${fmtDateLong(b.date)} at ${fmtMin12(b.start_min)}. ` +
    `See you at ${shop.name}${shop.address ? `, ${shop.address}` : ""}. ` +
    `Your booking (to view or change it): ${bookingLink(b.token)}`,

  decline: (b: AdminBookingDto, shop: ShopInfo) =>
    `${hi(b)}, sorry, ${fmtDateLong(b.date)} at ${fmtMin12(b.start_min)} isn't available. ` +
    `Please pick another time here: ${shopBookLink(shop.slug)}`,

  reminder: (b: AdminBookingDto, shop: ShopInfo, today: string, delayMin: number) =>
    `${hi(b)}, a reminder of your ${serviceNames(b.services)} ${dayRef(b, today)} at ${fmtMin12(b.start_min)} at ${shop.name}. ` +
    (delayMin > 0 ? `We're running about ${delayMin} minutes behind, so ${fmtMin12(b.start_min + delayMin)} works perfectly. ` : "See you soon! ") +
    `Your booking: ${bookingLink(b.token)}`,

  runningLate: (b: AdminBookingDto, delayMin: number) =>
    `${hi(b)}, we're running about ${delayMin} minutes behind. Your ${fmtMin12(b.start_min)} is now around ${fmtMin12(
      b.start_min + delayMin
    )}. Sorry for the wait! Your booking: ${bookingLink(b.token)}`,

  checkOnLate: (b: AdminBookingDto) =>
    `${hi(b)}, are you on your way? Your ${serviceNames(b.services)} was at ${fmtMin12(b.start_min)}. Your booking: ${bookingLink(b.token)}`,

  noShowRebook: (b: AdminBookingDto, shop: ShopInfo) =>
    `${hi(b)}, we missed you today. Want to book another time? ${shopBookLink(shop.slug)}`,
};

/** Opens WhatsApp right away (inside the tap, so phones don't block it). Returns false if there's no number. */
export function openWhatsApp(to: string | null, text: string): boolean {
  if (!to) return false;
  window.open(waLink(to, text), "_blank", "noopener");
  return true;
}
