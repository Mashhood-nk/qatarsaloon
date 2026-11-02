// The page every WhatsApp message links to: /b/<token>.
import { useState, type CSSProperties } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { api, errorMessage } from "../../lib/api";
import { useData } from "../../lib/useData";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import type { PublicBookingDto } from "../../../shared/types";
import { fmtDateLong, fmtDuration, fmtMin } from "../../../shared/time";
import { fmtPhone } from "../../../shared/phone";
import { money, serviceNames, zonedToUtc } from "../../lib/format";
import { ErrorNote, Row, Spinner, StatusPill } from "../../components/ui";
import { Icon } from "../../components/Icon";

function downloadIcs(b: PublicBookingDto) {
  const tz = b.shop.timezone;
  const start = zonedToUtc(b.date, b.start_min, tz);
  const end = new Date(start.getTime() + b.duration_min * 60000);
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//barber-booking//EN",
    "BEGIN:VEVENT",
    `UID:${b.token}@barber-booking`,
    `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(start)}`,
    `DTEND:${f(end)}`,
    `SUMMARY:${esc(`${serviceNames(b.services)} at ${b.shop.name}`)}`,
    b.shop.address ? `LOCATION:${esc(b.shop.address)}` : "",
    `DESCRIPTION:${esc(`Your booking: ${window.location.href.split("?")[0]}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "booking.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BookingPage() {
  const { token = "" } = useParams();
  const [params] = useSearchParams();
  const isNew = params.get("new") === "1";
  const { data: b, error, reload, setData } = useData(() => api.get<PublicBookingDto>(`/bookings/${token}`), [token]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useDocumentTitle(b ? `Your booking · ${b.shop.name}` : "Your booking");

  if (error) return <div className="mx-auto max-w-xl p-5"><ErrorNote message={error} onRetry={reload} /></div>;
  if (!b) return <Spinner />;

  const style = { "--accent": b.shop.accent } as CSSProperties;
  const active = b.status === "pending" || b.status === "confirmed" || b.status === "in_progress";

  const cancel = async () => {
    if (!confirm("Cancel this booking?")) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/bookings/${token}/cancel`);
      setData({ ...b, status: "cancelled", can_change: false });
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const headline =
    b.status === "pending" && isNew
      ? "Request sent"
      : b.status === "pending"
        ? "Waiting for confirmation"
        : b.status === "cancelled"
          ? "Booking cancelled"
          : b.status === "declined"
            ? "This time wasn't available"
            : b.status === "done"
              ? "Thanks for visiting"
              : b.status === "no_show"
                ? "We missed you"
                : null;

  return (
    <div style={style} className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="flex items-center justify-between border-b border-line px-5 py-4">
        <Link to={`/${b.shop.slug}`} className="display truncate text-[22px] font-semibold">
          {b.shop.name}
        </Link>
        <span className="shrink-0 text-[13px] text-muted">Your booking</span>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-8 pb-2">
        <div>
          <StatusPill status={b.status} />
        </div>
        {headline ? (
          <h1 className="display text-[40px] leading-[1.1]">{headline}</h1>
        ) : (
          <h1 className="display text-[40px] leading-[1.1]">
            {fmtDateLong(b.date)}
            <br />
            at {fmtMin(b.start_min)}
          </h1>
        )}
        {b.status === "pending" && (
          <p className="text-base leading-relaxed text-ink-soft">
            Thanks{b.customer_name ? `, ${b.customer_name}` : ""}. You'll get a confirmation on WhatsApp
            {b.whatsapp ? ` (${fmtPhone(b.whatsapp)})` : ""} shortly. Keep this link to check or change your booking.
          </p>
        )}
        {b.status === "confirmed" && <p className="text-[15px] text-ink-soft">See you soon{b.customer_name ? `, ${b.customer_name}` : ""}.</p>}
      </div>

      <div className="card mx-5 mt-4 flex flex-col gap-3.5 p-5">
        <Row label="When">
          {fmtDateLong(b.date)} · {fmtMin(b.start_min)}
        </Row>
        <Row label="Services">{serviceNames(b.services)}</Row>
        {b.barber_name && <Row label="Barber">{b.barber_name}</Row>}
        <Row label="Duration">{fmtDuration(b.duration_min)}</Row>
        <Row label="Total">{money(b.price_total, b.shop.currency)} · pay at shop</Row>
        {b.shop.address && <Row label="Where">{b.shop.address}</Row>}
      </div>

      {active && (
        <div className={`grid gap-2.5 px-5 pt-5 ${b.shop.map_url ? "grid-cols-2" : "grid-cols-1"}`}>
          {b.shop.map_url && (
            <a href={b.shop.map_url} target="_blank" rel="noreferrer" className="btn-quiet">
              <Icon name="pin" size={16} /> Directions
            </a>
          )}
          <button type="button" className="btn-quiet" onClick={() => downloadIcs(b)}>
            <Icon name="calendar" size={16} /> Add to calendar
          </button>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2.5 px-5 pt-6 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
        {actionError && <ErrorNote message={actionError} />}
        {!active && (
          <Link to={`/${b.shop.slug}/book`} className="btn-primary w-full">
            Book {b.status === "done" ? "again" : "a new time"}
          </Link>
        )}
        {active && b.can_change && (
          <>
            <Link to={`/${b.shop.slug}/book`} className="btn-outline w-full">
              Book a different time
            </Link>
            <button type="button" className="h-12 text-[15px] text-bad-ink disabled:opacity-50" onClick={cancel} disabled={busy}>
              Cancel booking
            </button>
            <span className="text-center text-[13px] leading-relaxed text-muted">
              To change your time, cancel this booking and book a new one. Changes are possible up to{" "}
              {fmtDuration(b.change_cutoff_min)} before.
            </span>
          </>
        )}
        {active && !b.can_change && b.status !== "in_progress" && (
          <span className="text-center text-[13px] text-muted">
            It's too close to your appointment to change it online. Please contact {b.shop.name} directly.
          </span>
        )}
        <Link to={`/${b.shop.slug}`} className="text-center text-sm text-muted underline-offset-2 hover:underline">
          Back to {b.shop.name}
        </Link>
      </div>
    </div>
  );
}
