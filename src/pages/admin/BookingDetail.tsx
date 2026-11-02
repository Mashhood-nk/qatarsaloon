import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, errorMessage } from "../../lib/api";
import { useData } from "../../lib/useData";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import type { AdminBookingDto } from "../../../shared/types";
import { fmtDateLong, fmtMin, nowInZone } from "../../../shared/time";
import { fmtPhone } from "../../../shared/phone";
import { money, serviceNames } from "../../lib/format";
import { actualMinutes, elapsedSeconds, fmtTimer, lateBy, useTick } from "../../lib/live";
import { customerWhatsApp, messages, openWhatsApp } from "../../lib/messages";
import { BackLink, ErrorNote, Row, Spinner, StatusPill } from "../../components/ui";
import { Icon, type IconName } from "../../components/Icon";
import { useAdmin } from "./AdminLayout";

function OptionButton({ icon, title, hint, onClick, danger, disabled }: { icon: IconName; title: string; hint: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[72px] items-center gap-3.5 rounded-2xl border bg-surface px-4 py-3.5 text-left disabled:opacity-50 ${danger ? "border-[#E8C4BD]" : "border-line"}`}
    >
      <Icon name={icon} size={22} className={`shrink-0 ${danger ? "text-bad-ink" : ""}`} />
      <span className="flex flex-col gap-0.5">
        <span className={`text-[15px] font-medium ${danger ? "text-bad-ink" : ""}`}>{title}</span>
        <span className="text-[13px] text-muted">{hint}</span>
      </span>
    </button>
  );
}

export function BookingDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { shop, shopInfo, me } = useAdmin();
  const { data: b, error, reload, setData } = useData(() => api.get<AdminBookingDto>(`/admin/bookings/${id}`), [id]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useTick(b?.status === "in_progress" ? 1000 : 30000);
  useDocumentTitle("Booking");

  if (error && !b) return <div className="p-5"><ErrorNote message={error} onRetry={reload} /></div>;
  if (!b) return <Spinner />;

  const now = nowInZone(shop.timezone);
  const late = lateBy(b, now);
  const to = customerWhatsApp(b);
  const first = b.customer?.name?.split(" ")[0] || "them";

  const act = async (action: string, wa?: string) => {
    if (wa) openWhatsApp(to, wa);
    setBusy(true);
    setActionError(null);
    try {
      setData(await api.post<AdminBookingDto>(`/admin/bookings/${b.id}/${action}`));
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const primaryPreview =
    b.status === "pending" ? messages.confirm(b, shopInfo) : b.status === "no_show" ? messages.noShowRebook(b, shopInfo) : null;

  return (
    <>
      <header className="flex items-center gap-2 px-3 pt-3">
        <BackLink to="/admin" label="Back to today" />
        <span className="text-[13px] text-muted">{b.source === "walkin" ? "Walk-in" : "Booking"}</span>
      </header>

      <div className="flex flex-col gap-2.5 px-5 pt-3 pb-2">
        <div className="flex flex-wrap gap-2">
          <StatusPill status={b.status} />
          {late > shop.grace_min && b.status === "confirmed" && (
            <span className="rounded-full bg-bad-bg px-3 py-1.5 text-xs font-medium text-bad-ink">Late · {late} min</span>
          )}
        </div>
        <h1 className="display text-[38px] leading-[1.1]">{b.customer?.name || "Guest"}</h1>
        {b.customer && !b.customer.is_guest && (
          <Link to={`/admin/customers/${b.customer.id}`} className="text-sm text-[var(--accent)]">
            {b.customer.visits > 0 ? `Returning · ${b.customer.visits} visit${b.customer.visits === 1 ? "" : "s"}` : "New customer"}
            {b.customer.no_shows > 0 ? ` · ${b.customer.no_shows} no-show${b.customer.no_shows === 1 ? "" : "s"}` : ""} · view profile
          </Link>
        )}
      </div>

      <div className="card mx-5 mt-3 flex flex-col gap-3 p-[18px]">
        <Row label="When">
          {fmtDateLong(b.date)} · {fmtMin(b.start_min)} – {fmtMin(b.start_min + b.duration_min)}
        </Row>
        <Row label="Services">{serviceNames(b.services)}</Row>
        <Row label="Total">{money(b.price_total, me.shop?.currency ?? "QAR")}</Row>
        {b.customer?.phone && <Row label="Mobile">{fmtPhone(b.customer.phone)}</Row>}
        {b.customer?.whatsapp && <Row label="WhatsApp">{fmtPhone(b.customer.whatsapp)}</Row>}
        {b.status === "done" && actualMinutes(b) && <Row label="Actual time">{actualMinutes(b)} min</Row>}
        {b.reminder_sent_at && <Row label="Reminder">Sent</Row>}
      </div>

      {b.customer && (b.customer.notes || b.customer.prefs.length > 0) && (
        <div className="mx-5 mt-3 flex flex-col gap-2 rounded-2xl bg-sand p-[18px]">
          <span className="eyebrow">Your notes on {first}</span>
          {b.customer.prefs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {b.customer.prefs.map((p) => (
                <span key={p} className="rounded-full bg-surface px-2.5 py-1 text-[13px]">
                  {p}
                </span>
              ))}
            </div>
          )}
          {b.customer.notes && <p className="text-[15px] leading-relaxed whitespace-pre-line">{b.customer.notes}</p>}
        </div>
      )}

      {primaryPreview && to && (
        <div className="flex flex-col gap-2.5 px-5 pt-6">
          <span className="eyebrow">Message that opens in WhatsApp</span>
          <div className="max-w-[310px] self-end rounded-[16px_16px_4px_16px] bg-wa-bubble px-3.5 py-3 text-sm leading-relaxed text-[#1F2A1A]">{primaryPreview}</div>
        </div>
      )}

      <div className="flex flex-col gap-2.5 px-5 pt-6 pb-6">
        {actionError && <ErrorNote message={actionError} />}

        {b.status === "pending" && (
          <>
            <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => act("confirm", messages.confirm(b, shopInfo))}>
              <Icon name="whatsapp" size={18} /> Confirm on WhatsApp
            </button>
            <button type="button" className="btn-outline w-full" disabled={busy} onClick={() => act("decline", messages.decline(b, shopInfo))}>
              Decline
            </button>
            {!to && <p className="text-center text-[13px] text-muted">No number on file, so no WhatsApp message will open.</p>}
          </>
        )}

        {b.status === "confirmed" && (
          <>
            <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => act("start")}>
              Start visit
            </button>
            {late > 0 ? (
              <>
                <span className="eyebrow pt-2">{first} is {late} min late</span>
                {to && <OptionButton icon="whatsapp" title={`Check on ${first}`} hint="Opens WhatsApp: are you on your way?" onClick={() => openWhatsApp(to, messages.checkOnLate(b))} />}
                <OptionButton icon="ban" title="Mark as no-show" hint="Frees the slot and logs it on their profile" danger disabled={busy} onClick={() => act("noshow")} />
              </>
            ) : (
              to && (
                <OptionButton
                  icon="whatsapp"
                  title={b.reminder_sent_at ? "Send reminder again" : "Send reminder"}
                  hint="Opens WhatsApp with the reminder ready"
                  disabled={busy}
                  onClick={() => act("reminder", messages.reminder(b, shopInfo, now.date, 0))}
                />
              )
            )}
            <button
              type="button"
              className="h-12 text-[15px] text-bad-ink disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                if (confirm("Cancel this booking?")) void act("cancel");
              }}
            >
              Cancel booking
            </button>
          </>
        )}

        {b.status === "in_progress" && (
          <button type="button" className="flex h-[54px] w-full items-center justify-center gap-3 rounded-full bg-ink text-base text-cream disabled:opacity-50" disabled={busy} onClick={() => act("finish")}>
            <span className="tabular-nums">{fmtTimer(elapsedSeconds(b))}</span> Finish visit
          </button>
        )}

        {b.status === "cancelled" && (
          <div className="flex flex-col gap-3 rounded-2xl bg-bad-bg/60 p-4 text-[15px]">
            <span>
              {b.cancelled_by === "customer" ? `${b.customer?.name?.split(" ")[0] || "The customer"} cancelled this booking` : "You cancelled this booking"}
              {b.cancelled_at ? ` on ${new Date(b.cancelled_at).toLocaleString("en-GB", { timeZone: shop.timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}. The slot is free again.
            </span>
            {b.cancelled_by === "customer" && !b.seen_at && (
              <button type="button" className="btn-outline w-full" disabled={busy} onClick={() => act("seen")}>
                OK, got it
              </button>
            )}
          </div>
        )}

        {b.status === "no_show" && (
          <>
            {to && (
              <button type="button" className="btn-primary w-full" onClick={() => openWhatsApp(to, messages.noShowRebook(b, shopInfo))}>
                <Icon name="whatsapp" size={18} /> Ask if they want to rebook
              </button>
            )}
            <button type="button" className="btn-outline w-full" disabled={busy} onClick={() => act("undo_noshow")}>
              Undo no-show
            </button>
          </>
        )}

        <button type="button" className="mt-2 text-sm text-muted underline" onClick={() => navigate("/admin")}>
          Back to today
        </button>
      </div>
    </>
  );
}
