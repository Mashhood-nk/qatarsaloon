import { useEffect, useMemo, useRef, useState } from "react";
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
import { BarberChips, useAdmin } from "./AdminLayout";
import { pushStatus, type PushStatus } from "../../lib/push";

const PROMPT_KEY = "bb:push-prompt-dismissed";

/** A small nudge on Today until this device has notifications on. */
function PushPrompt() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(PROMPT_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    pushStatus().then(setStatus).catch(() => setStatus("unsupported"));
  }, []);
  if (dismissed || !status || status === "on" || status === "unsupported") return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(PROMPT_KEY, "1");
    } catch {
      /* fine */
    }
  };
  return (
    <div className="mx-5 mt-2 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5">
      <Icon name="info" className="shrink-0 text-muted" />
      <Link to="/admin/shop" className="flex-1 text-sm leading-snug">
        {status === "ios-install" ? "Add this app to your home screen to get booking alerts." : "Turn on notifications to hear about new bookings."}{" "}
        <span className="text-[var(--accent)] underline">Set up</span>
      </Link>
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-sand">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

const FILTER_KEY = "bb:today-barber";

function loadFilter(): number | "all" {
  try {
    const v = localStorage.getItem(FILTER_KEY);
    return v && v !== "all" ? Number(v) : "all";
  } catch {
    return "all";
  }
}

type Row =
  | { kind: "booking"; at: number; b: AdminBookingDto }
  | { kind: "break"; at: number; end: number; label: string };

export function Today() {
  const { shop, shopInfo, isOwner, barbers, defaultBarberId, me } = useAdmin();
  useDocumentTitle("Today");
  const [offset, setOffset] = useState(0);
  // Owners can look at everyone or one barber; barbers always see their own day.
  const [filter, setFilterState] = useState<number | "all">(() => {
    const f = loadFilter();
    return f === "all" || barbers.some((b) => b.id === f) ? f : "all";
  });
  const setFilter = (f: number | "all") => {
    setFilterState(f);
    try {
      localStorage.setItem(FILTER_KEY, String(f));
    } catch {
      /* fine */
    }
  };
  const barberParam = isOwner && barbers.length > 1 ? `barber=${filter}` : "";
  const loadedAt = useRef(Date.now());
  const { data, error, reload, setData } = useData(
    async () => {
      const base = await api.get<TodayDto>(`/admin/today?${barberParam}`);
      const d = offset === 0 ? base : await api.get<TodayDto>(`/admin/today?date=${addDays(base.now_date, offset)}&${barberParam}`);
      loadedAt.current = Date.now();
      return d;
    },
    [offset, barberParam],
    { pollMs: 30000 }
  );
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showBreak, setShowBreak] = useState(false);

  const running = data?.bookings.some((b) => b.status === "in_progress");
  useTick(running ? 1000 : 30000);

  const now = data ? liveNow(data.now_date, data.now_min, loadedAt.current) : null;
  const isToday = !!data && data.date === data.now_date;

  const multi = (data?.days.length ?? 0) > 1;
  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const r: Row[] = data.bookings.map((b) => ({ kind: "booking", at: b.start_min, b }));
    for (const d of data.days) {
      const who = data.days.length > 1 ? `${d.barber_name}: ` : "";
      d.breaks.forEach((b) => r.push({ kind: "break", at: b.start_min, end: b.end_min, label: who + b.label }));
      d.time_off.forEach((t) => r.push({ kind: "break", at: t.start_min, end: t.end_min, label: who + (t.reason || "Time off") }));
    }
    return r.sort((a, b) => a.at - b.at);
  }, [data]);

  if (error && !data) return <div className="p-5"><ErrorNote message={error} onRetry={reload} /></div>;
  if (!data || !now) return <Spinner />;

  // Each barber can be running late independently.
  const delays = isToday
    ? data.days
        .map((d) => runningDelay(data.bookings.filter((b) => b.barber_id === d.barber_id), now, data.settings, shop.timezone))
        .filter((x): x is NonNullable<typeof x> => !!x && x.overByMin > 0)
    : [];
  const delayFor = (id: number) => delays.find((x) => x.next?.id === id)?.delayMin ?? 0;
  const allClosed = data.days.length > 0 && data.days.every((d) => !d.hours);
  const breakBarber = filter === "all" ? defaultBarberId : filter;
  const breakBarberName = barbers.find((b) => b.id === breakBarber)?.name;
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
      await api.post("/admin/quick-break", { minutes, barber_id: breakBarber });
      setToast(`${breakBarberName && barbers.length > 1 ? `${breakBarberName}'s bookings` : "Bookings"} paused for ${minutes} minutes`);
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
        {isToday && breakBarber && (
          <div className="relative">
            <button type="button" className="btn-quiet border-ink" onClick={() => setShowBreak((s) => !s)} aria-expanded={showBreak}>
              <Icon name="pause" size={16} /> Take a break
            </button>
            {showBreak && (
              <div className="absolute right-0 z-30 mt-2 flex w-56 flex-col gap-2 rounded-2xl bg-ink p-4 text-cream shadow-xl">
                <span className="text-xs text-[#CFC5B5]">
                  Blocks new bookings{barbers.length > 1 && breakBarberName ? ` for ${breakBarberName}` : ""} from now
                </span>
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

      {isToday && !me.acting && <PushPrompt />}
      {isOwner && <BarberChips value={filter} onChange={setFilter} allowAll label="Show schedule for" />}

      {delays.map((delay) => (
        <div key={delay.running.id} className="mx-5 mt-2 flex flex-col gap-3 rounded-2xl border border-amber-line bg-amber-bg p-4" role="status">
          <div className="flex items-start gap-2.5 text-amber-ink">
            <Icon name="clock" className="mt-px shrink-0" />
            <div className="flex flex-col gap-1">
              <span className="text-[15px] font-semibold">
                {multi ? `${delay.running.barber_name} is r` : "R"}unning ~{delay.delayMin || delay.overByMin} min behind
              </span>
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
      ))}

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

      {(
        <div className="px-5 pt-2.5">
          <Link to="/admin/new" className="flex h-[50px] items-center justify-center gap-2 rounded-full border border-dashed border-[#8C8273] text-[15px]">
            <Icon name="plus" size={18} /> Add booking
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
                  {when(c.date, c.start_min)} · {barbers.length > 1 ? `${c.barber_name} · ` : ""}
                  {serviceNames(c.services)}
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
                  <span className="text-[13px] text-muted">
                    {barbers.length > 1 ? `${r.barber_name} · ` : ""}
                    {serviceNames(r.services)}
                  </span>
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
        {allClosed && <p className="py-3 text-[15px] text-muted">Closed on this day.</p>}
        {!allClosed && rows.length === 0 && <p className="py-3 text-[15px] text-muted">No bookings yet.</p>}
        {rows.map((row) =>
          row.kind === "break" ? (
            <div key={`br-${row.at}-${row.label}`} className="flex min-h-[52px] items-center gap-3 border-b border-line py-3">
              <span className="w-[46px] shrink-0 text-sm text-muted">{fmtMin(row.at)}</span>
              <span className="flex-1 text-sm text-muted italic">
                {row.label} until {fmtMin(row.end)}
              </span>
            </div>
          ) : (
            <ScheduleRow key={row.b.id} b={row.b} data={data} isToday={isToday} now={now} busy={busyId === row.b.id} act={act} delayMin={delayFor(row.b.id)} showBarber={multi} />
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
  showBarber,
}: {
  b: AdminBookingDto;
  data: TodayDto;
  isToday: boolean;
  now: { date: string; min: number };
  busy: boolean;
  act: (b: AdminBookingDto, action: string, wa?: string) => void;
  delayMin: number;
  showBarber: boolean;
}) {
  const { shopInfo } = useAdmin();
  const name = b.customer?.name || "Guest";
  const late = isToday ? lateBy(b, now) : 0;
  const rem = reminderState(b, now, data.settings);
  const anyRunning = data.bookings.some((x) => x.status === "in_progress" && x.barber_id === b.barber_id);
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
        <span className={`truncate text-xs text-muted ${b.status === "cancelled" ? "line-through" : ""}`}>
          {showBarber ? `${b.barber_name} · ` : ""}
          {serviceNames(b.services)}
        </span>
      </Link>
      {right}
    </div>
  );
}
