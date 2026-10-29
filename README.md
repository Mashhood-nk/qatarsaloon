# Barber booking

Online booking for barbershops, built to host many shops on one platform. Customers book from a link and get confirmations on WhatsApp; the barber manages everything from a phone-friendly admin.

**Stack** (all production-standard): React 19 + TypeScript + Tailwind CSS v4 for the app, Hono on Cloudflare Workers for the API, Cloudflare D1 (SQLite) for data, R2 for photos. One Worker serves both the app and `/api`.

## What's in Round 1

**Customers**
- Shop page `/<shop>`: cover, services and prices, gallery, hours, directions, call/WhatsApp
- Booking `/<shop>/book`: pick services → date and time (only real free slots) → mobile + name, optional separate WhatsApp number with country codes
- Booking page `/b/<token>` (the link in every WhatsApp message): status, add to calendar, cancel (until the cutoff)

**Barber admin** `/admin`
- Today: new requests (confirm/decline opens WhatsApp with the message ready), schedule with Start/Finish timer, running-late banner with one-tap "let the next customer know", late customers, reminder status, quick break, other days
- Walk-ins: start now or add to the next free gap; guest option
- Customers: search, profile with preferences, notes, visit history and real visit times
- Services, weekly hours, breaks, time off, booking rules (buffer, grace period, reminder time, etc.)
- Shop page: name, text, address, map link, phone, WhatsApp, accent colour, cover, logo, gallery; change password

**Coming in Round 2:** push notifications and installable admin app, reminder nudges, insights (actual vs set durations), reschedule requests, move-booking and fill-the-gap flows, platform page for adding shops.

## Run it locally

Needs Node.js 20+.

```bash
npm install
npm run db:migrate:local        # create the tables
npm run db:seed:local           # Ashique's shop, services, hours
# create a login (prints SQL), then run it locally:
npm run hash-password -- ashique "choose-a-password" ashique "Ashique"
npx wrangler d1 execute barber-db --local --command "<paste the printed SQL>"
npm run dev                     # http://localhost:5173/ashique  and  /admin
```

`npm test` runs the slot-engine tests, `npm run typecheck` checks types.

## Deploy to Cloudflare (free plan is enough)

```bash
npx wrangler login
npx wrangler d1 create barber-db            # copy the database_id into wrangler.jsonc
npx wrangler r2 bucket create barber-images
npm run db:migrate:remote
npm run db:seed:remote
npm run hash-password -- ashique "a-strong-password" ashique "Ashique"
npx wrangler d1 execute barber-db --remote --command "<paste the printed SQL>"
npm run deploy
```

The site is then live at `https://barber-booking.<your-account>.workers.dev`. Add a custom domain later in the Cloudflare dashboard (Workers → barber-booking → Settings → Domains), ideally before real customers start booking, because WhatsApp links use the address.

## How the code is organised

```
shared/          used by both the app and the API
  slots.ts       the slot engine (pure functions) + slots.test.ts
  time.ts        dates/times in the shop's time zone
  phone.ts       country codes, E.164 numbers, WhatsApp links
  types.ts       API response shapes
worker/          Cloudflare Worker (API)
  routes/public.ts   shop page, slots, booking requests, booking link
  routes/admin.ts    everything the barber does
  routes/auth.ts     login, sessions, password
migrations/      D1 schema (every table has shop_id: multi-shop from day one)
seed/seed.sql    starting data for Ashique's shop
src/             React app
  pages/shop/    customer pages
  pages/admin/   barber admin
  lib/messages.ts  the prefilled WhatsApp messages
```

## Notes

- Times are stored as minutes since midnight and dates as `YYYY-MM-DD`, both in the shop's time zone (default `Asia/Qatar`).
- A customer's mobile number is their identity within a shop. There's no number verification yet; each booking link carries a random secret so others can't change it.
- Free WhatsApp approach: the app opens WhatsApp with the message filled in and the barber presses Send. No WhatsApp API costs.
- Photos are resized in the browser before upload, so no paid image service is needed.
