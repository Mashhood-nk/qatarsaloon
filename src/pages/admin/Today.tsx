import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { api, errorMessage } from "../../lib/api";
import { useData } from "../../lib/useData";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import type { AdminBookingDto, TodayDto } from "../../../shared/types";
import { addDays, fmtDateLong, fmtDateShort, fmtMin } from "../../../shared/time";
import { serviceNames, when } from "../../lib/format";
import { actualMinutes, elapsedSeconds, fmtTimer, lateBy, liveNow, reminderState, runningDelay, useTick } from "../../lib/live";
import { customerWhatsApp, messages, openWhatsApp } from "../../lib/messages";
import { ErrorNote, Pill, SectionTitle, Spinner, Toast } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { useAdmin } from "./AdminLayout";

type Row =
  | { kind: "booking"; at: number; b: AdminBookingDto }
  | { kind: "break"; at: number; end: number; label: string };

export function Today() {
  const { shop, shopInfo } = useAdmin();
  useDocumentTitle("Today");
  const [offset, setOffset] = useState(0);
  const loadedAt = useRef(Date.now());
  const { data, error, reload, setData } = useData(
    async () => {
      const base = await api.get<TodayDto>("/admin/today");
      const d = offset === 0 ? base : await api.get<TodayDto>(`/admin/today?date=${addDays(base.now_date, offset)}`);
      loadedAt.current = Date.now();
      return d;
    },
    [offset],
    { pollMs: 30000 }
  );
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showBreak, setShowBreak] = useState(false);

  const running = data?.bookings.some((b) => b.status === "in_progress");
  useTick(running ? 1000 : 30000);

  const now = data ? liveNow(data.now_date, data.now_min, loadedAt.current) : null;
  const isToday = !!data && data.date === data.now_date;

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const r: Row[] = data.bookings.map((b) => ({ kind: "booking", at: b.start_min, b }));
    data.breaks.forEach((b) => r.push({ kind: "break", at: b.start_min, end: b.end_min, label: b.label }));
    data.time_off.forEach((t) => r.push({ kind: "break", at: t.start_min, end: t.end_min, label: t.reason || "Time off" }));
    return r.sort((a, b) => a.at - b.at);
  }, [data]);

  if (error && !data) return <div className="p-5"><ErrorNote message={error} onRetry={reload} /></div>;
  if (!data || !now) return <Spinner />;

  const delay = isToday ? runningDelay(data.bookings, now, data.settings, shop.timezone) : null;
  const booked = data.bookings.filter((b) => ["confirmed", "in_progress", "done"].includes(b.status)).length;
  const done = data.bookings.filter((b) => b.status === "done").length;

  const replace = (b: AdminBookingDto) =>
    setData((d) =>
      d
        ? {
            ...d,
            bookings: d.bookings.some((x) => x.id === b.id) ? d.bookings.map((x) => (x.id === b.id ? b : x)) : d.bookings,
            requests: d.requests.filter((x) => x.id !== b.id || b.status === "pending"),
            cancellations: d.cancellations.filter((x) => x.id !== b.id || !b.seen_at),
          }
        : d
    );

  const act = async (b: AdminBookingDto, action: string, wa?: string) => {
    if (wa) openWhatsApp(customerWhatsApp(b), wa);
    setBusyId(b.id);
    try {
      const updated = await api.post<AdminBookingDto>(`/admin/bookings/${b.id}/${action}`);
      replace(updated);
      if (action === "confirm" || action === "decline") void reload();
    } catch (e) {
      setToast(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const quickBreak = async (minutes: number) => {
    setShowBreak(false);
    try {
      await api.post("/admin/quick-break", { minutes });
      setToast(`Bookings paused for ${minutes} minutes`);
      void reload();
    } catch (e) {
      setToast(errorMessage(e));
    }
  };

  return (
    <>
      <header className="flex items-start justify-between gap-3 px-5 pt-6 pb-2">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-muted">
            {fmtDateLong(data.date)}
            {isToday ? ` · ${fmtMin(now.min)}` : ""}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous day" className="-ml-2 flex size-9 items-center justify-center rounded-full hover:bg-sand" onClick={() => setOffset((o) => o - 1)}>
              <Icon name="chevronLeft" />
            </button>
            <h1 className="display text-[34px] leading-none">{offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : fmtDateShort(data.date)}</h1>
            <button type="button" aria-label="Next day" className="flex size-9 items-center justify-center rounded-full hover:bg-sand" onClick={() => setOffset((o) => o + 1)}>
              <Icon name="chevronRight" />
            </button>
          </div>
          {offset !== 0 && (
            <button type="button" className="self-start text-[13px] text-[var(--accent)] underline" onClick={() => setOffset(0)}>
              Back to today
            </button>
          )}
        </div>
        {isToday && (
          <div className="relative">
            <button type="button" className="btn-quiet border-ink" onClick={() => setShowBreak((s) => !s)} aria-expanded={showBreak}>
              <Icon name="pause" size={16} /> Take a break
            </button>
            {showBreak && (
              <div className="absolute right-0 z-30 mt-2 flex w-56 flex-col gap-2 rounded-2xl bg-ink p-4 text-cream shadow-xl">
                <span className="text-xs text-[#CFC5B5]">Blocks new bookings from now</span>
                <div className="grid grid-cols-3 gap-2">
                  {[15, 30, 60].map((m) => (
                    <button key={m} type="button" onClick={() => quickBreak(m)} className="h-11 rounded-full border border-[#6E665B] text-sm hover:bg-white/10">
                      {m === 60 ? "1 h" : `${m}m`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      {delay && delay.overByMin > 0 && (
        <div className="mx-5 mt-2 flex flex-col gap-3 rounded-2xl border border-amber-line bg-amber-bg p-4" role="status">
          <div className="flex items-start gap-2.5 text-amber-ink">
            <Icon name="clock" className="mt-px shrink-0" />
            <div className="flex flex-col gap-1">
              <span className="text-[15px] font-semibold">Running ~{delay.delayMin || delay.overByMin} min behind</span>
              <span className="text-[13px] leading-snug">
                {delay.running.customer?.name || "This visit"} is over by {delay.overByMin} min.
                {delay.next && delay.delayMin > 0
                  ? ` ${delay.next.customer?.name || "The next customer"}'s ${fmtMin(delay.next.start_min)} will likely start around ${fmtMin(delay.next.start_min + delay.delayMin)}.`
                  : " The next booking isn't affected yet."}
              </span>
            </div>
          </div>
          {delay.next && delay.delayMin > 0 && customerWhatsApp(delay.next) && (
            <button
              type="button"
              onClick={() => openWhatsApp(customerWhatsApp(delay.next!), messages.runningLate(delay.next!, delay.delayMin))}
              className="flex h-[46px] items-center justify-center gap-2 rounded-full bg-amber-ink text-sm text-[#FFF8EC]"
            >
              <Icon name="whatsapp" size={16} /> Let {delay.next.customer?.name?.split(" ")[0] || "them"} know on WhatsApp
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 px-5 pt-3.5 pb-1">
        <div className="flex flex-col gap-1 rounded-[14px] bg-surface p-3.5">
          <span className="text-2xl">{booked}</span>
          <span className="text-xs text-muted">Booked</span>
        </div>
        <div className="flex flex-col gap-1 rounded-[14px] bg-amber-bg p-3.5 text-amber-ink">
          <span className="text-2xl">{data.requests.length}</span>
          <span className="text-xs">To confirm</span>
        </div>
        <div className="flex flex-col gap-1 rounded-[14px] bg-surface p-3.5">
          <span className="text-2xl">{done}</span>
          <span className="text-xs text-muted">Done</span>
        </div>
      </div>

      {isToday && (
        <div className="px-5 pt-2.5">
          <Link to="/admin/walkin" className="flex h-[50px] items-center justify-center gap-2 rounded-full border border-dashed border-[#8C8273] text-[15px]">
            <Icon name="plus" size={18} /> Add walk-in
          </Link>
        </div>
      )}

      {data.cancellations.length > 0 && (
        <section className="flex flex-col gap-2.5 px-5 pt-5" aria-live="polite">
          <SectionTitle>Cancelled by customer</SectionTitle>
          {data.cancellations.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-[#E8C4BD] bg-bad-bg/60 p-4">
              <Icon name="ban" size={20} className="shrink-0 text-bad-ink" />
              <Link to={`/admin/bookings/${c.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-medium">{c.customer?.name || "Customer"} cancelled</span>
                <span className="truncate text-[13px] text-ink-soft">
                  {when(c.date, c.start_min)} · {serviceNames(c.services)}
                </span>
                <span className="text-xs text-muted">The slot is free again.</span>
              </Link>
              <button
                type="button"
                disabled={busyId === c.id}
                onClick={() => act(c, "seen")}
                className="h-11 shrink-0 rounded-full border border-ink px-4 text-sm disabled:opacity-50"
              >
                OK
              </button>
            </div>
          ))}
        </section>
      )}

      {data.requests.length > 0 && (
        <section className="flex flex-col gap-2.5 px-5 pt-5">
          <SectionTitle>New requests</SectionTitle>
          {data.requests.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 rounded-2xl border border-amber-line bg-surface p-4">
              <Link to={`/admin/bookings/${r.id}`} className="flex justify-between gap-3">
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-base font-medium">{r.customer?.name || "Customer"}</span>
                  <span className="text-[13px] text-muted">{serviceNames(r.services)}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[15px]">{when(r.date, r.start_min)}</span>
                  <span className="text-xs text-muted">{r.customer && r.customer.visits > 0 ? `Returning · ${r.customer.visits} visits` : "New customer"}</span>
                </span>
              </Link>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={busyId === r.id} className="h-[46px] rounded-full border border-field text-sm disabled:opacity-50" onClick={() => act(r, "decline", messages.decline(r, shopInfo))}>
                  Decline
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  className="flex h-[46px] items-center justify-center gap-1.5 rounded-full bg-[var(--accent)] text-sm text-cream disabled:opacity-50"
                  onClick={() => act(r, "confirm", messages.confirm(r, shopInfo))}
                >
                  <Icon name="whatsapp" size={16} /> Confirm
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col px-5 pt-5 pb-4">
        <SectionTitle>Schedule</SectionTitle>
        {!data.hours && <p className="py-3 text-[15px] text-muted">Closed on this day.</p>}
        {data.hours && rows.length === 0 && <p className="py-3 text-[15px] text-muted">No bookings yet.</p>}
        {rows.map((row) =>
          row.kind === "break" ? (
            <div key={`br-${row.at}-${row.label}`} className="flex min-h-[52px] items-center gap-3 border-b border-line py-3">
              <span className="w-[46px] shrink-0 text-sm text-muted">{fmtMin(row.at)}</span>
              <span className="flex-1 text-sm text-muted italic">
                {row.label} until {fmtMin(row.end)}
              </span>
            </div>
          ) : (
            <ScheduleRow key={row.b.id} b={row.b} data={data} isToday={isToday} now={now} busy={busyId === row.b.id} act={act} delayMin={delay?.next?.id === row.b.id ? delay.delayMin : 0} />
          )
        )}
      </section>
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

function ScheduleRow({
  b,
  data,
  isToday,
  now,
  busy,
  act,
  delayMin,
}: {
  b: AdminBookingDto;
  data: TodayDto;
  isToday: boolean;
  now: { date: string; min: number };
  busy: boolean;
  act: (b: AdminBookingDto, action: string, wa?: string) => void;
  delayMin: number;
}) {
  const { shopInfo } = useAdmin();
  const name = b.customer?.name || "Guest";
  const late = isToday ? lateBy(b, now) : 0;
  const rem = reminderState(b, now, data.settings);
  const anyRunning = data.bookings.some((x) => x.status === "in_progress");
  const startSoon = isToday && b.status === "confirmed" && b.start_min - now.min <= 30 && !anyRunning;

  let right: React.ReactNode = null;
  if (b.status === "cancelled") {
    right = <Pill tone="bad">Cancelled</Pill>;
  } else if (b.status === "done") {
    const a = actualMinutes(b);
    right = <Pill tone="ok">Done{a ? ` · ${a} min` : ""}</Pill>;
  } else if (b.status === "no_show") {
    right = <Pill tone="bad">No-show</Pill>;
  } else if (b.status === "in_progress") {
    const sec = elapsedSeconds(b);
    const over = Math.floor(sec / 60) - b.duration_min;
    right = (
      <div className="flex flex-col items-end gap-1">
        <button type="button" disabled={busy} onClick={() => act(b, "finish")} className="flex h-11 items-center gap-2 rounded-full bg-ink px-3.5 text-[13px] text-cream disabled:opacity-50">
          <span className="tabular-nums">{fmtTimer(sec)}</span>
          <span>Finish</span>
        </button>
        {over > 0 && <span className="text-[11px] text-amber-ink">Over by {over} min</span>}
      </div>
    );
  } else if (b.status === "pending") {
    right = <Pill tone="amber">Not confirmed</Pill>;
  } else if (late > data.settings.grace_min) {
    right = (
      <Link to={`/admin/bookings/${b.id}`} className="flex flex-col items-end gap-1">
        <Pill tone="bad">Late · {late} min</Pill>
        <span className="text-[11px] text-muted underline">Options</span>
      </Link>
    );
  } else if (startSoon) {
    right = (
      <button type="button" disabled={busy} onClick={() => act(b, "start")} className="h-11 rounded-full border border-ink px-[18px] text-[13px] disabled:opacity-50">
        Start
      </button>
    );
  } else if (rem.kind === "due") {
    right = (
      <button
        type="button"
        disabled={busy}
        onClick={() => act(b, "reminder", messages.reminder(b, shopInfo, now.date, delayMin))}
        className="h-9 rounded-full border border-[var(--accent)] px-3 text-xs text-[var(--accent)] disabled:opacity-50"
      >
        Send reminder
      </button>
    );
  } else if (rem.kind === "sent") {
    right = (
      <span className="flex items-center gap-1 text-[11px] text-ok-ink">
        <Icon name="check" size={12} strokeWidth={2} /> Reminder sent
      </span>
    );
  } else if (rem.kind === "later" && isToday) {
    right = <span className="text-[11px] text-muted">Reminder at {fmtMin(rem.atMin)}</span>;
  }

  return (
    <div className="flex min-h-[52px] items-center gap-3 border-b border-line py-3">
      <span className="w-[46px] shrink-0 text-sm text-muted">{fmtMin(b.start_min)}</span>
      <Link to={`/admin/bookings/${b.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`truncate text-[15px] ${b.status === "cancelled" ? "text-muted line-through" : ""}`}>
          {b.source === "walkin" ? `Walk-in · ${name}` : name}
        </span>
        <span className={`truncate text-xs text-muted ${b.status === "cancelled" ? "line-through" : ""}`}>{serviceNames(b.services)}</span>
      </Link>
      {right}
    </div>
  );
}
