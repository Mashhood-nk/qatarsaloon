import { useEffect, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { useData } from "../../lib/useData";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import type { BreakDto, DayHoursDto, ShopSettings, TimeOffDto } from "../../../shared/types";
import { fmtDateLong, fmtMin, parseHHMM, WEEKDAYS_LONG } from "../../../shared/time";
import { ErrorNote, SectionTitle, Spinner, Switch, Toast } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { BarberChips, useAdmin } from "./AdminLayout";

interface Schedule {
  barber_id: number;
  hours: DayHoursDto[];
  breaks: BreakDto[];
  time_off: TimeOffDto[];
  settings: ShopSettings;
  today: string;
  now_min: number;
}

const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];
const toInput = (min: number) => fmtMin(min === 1440 ? 0 : min);
const fromInput = (s: string, isClose = false) => {
  const m = parseHHMM(s);
  if (m === null) return null;
  return isClose && m === 0 ? 1440 : m;
};

export function Hours() {
  const { isOwner, defaultBarberId, barbers } = useAdmin();
  useDocumentTitle(isOwner ? "Hours & breaks" : "My hours");
  const [barber, setBarber] = useState<number | null>(defaultBarberId);
  const { data, error, reload, setData } = useData(() => api.get<Schedule>(`/admin/schedule?barber=${barber ?? ""}`), [barber]);
  const [toast, setToast] = useState<string | null>(null);

  if (error && !data) return <div className="p-5"><ErrorNote message={error} onRetry={reload} /></div>;
  if (!data) return <Spinner />;
  const who = barbers.length > 1 ? barbers.find((b) => b.id === data.barber_id)?.name : null;
  // Re-mount the editors when switching barber so drafts don't carry over.
  const k = data.barber_id;

  return (
    <>
      <header className="px-5 pt-6 pb-2">
        <h1 className="display text-[36px]">{isOwner ? <>Hours &amp; breaks</> : "My hours"}</h1>
        {isOwner && who && <p className="pt-1 text-sm text-muted">Each barber has their own hours, breaks and time off.</p>}
      </header>
      {isOwner && barber !== null && <BarberChips value={barber} onChange={(v) => v !== "all" && setBarber(v)} label="Barber" />}
      <WeeklyHours key={`h${k}`} barberId={k} hours={data.hours} onSaved={(hours) => { setData({ ...data, hours }); setToast(who ? `${who}'s hours saved` : "Hours saved"); }} />
      <Breaks key={`b${k}`} barberId={k} breaks={data.breaks} onChange={(breaks) => setData({ ...data, breaks })} />
      <TimeOff key={`t${k}`} barberId={k} items={data.time_off} today={data.today} onChange={() => void reload()} />
      {isOwner && <Rules settings={data.settings} onSaved={(settings) => { setData({ ...data, settings }); setToast("Rules saved"); }} />}
      {!isOwner && <div className="pb-8" />}
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

function WeeklyHours({ barberId, hours, onSaved }: { barberId: number; hours: DayHoursDto[]; onSaved: (h: DayHoursDto[]) => void }) {
  const [rows, setRows] = useState(() => hours.map((h) => ({ ...h, open: toInput(h.open_min), close: toInput(h.close_min) })));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const update = (wd: number, patch: Partial<(typeof rows)[number]>) => {
    setRows((r) => r.map((x) => (x.weekday === wd ? { ...x, ...patch } : x)));
    setDirty(true);
  };

  const save = async () => {
    setError(null);
    const days = [];
    for (const r of rows) {
      const open = fromInput(r.open);
      const close = fromInput(r.close, true);
      if (!r.closed && (open === null || close === null || close <= open)) {
        setError(`Check ${WEEKDAYS_LONG[r.weekday]}: closing must be after opening`);
        return;
      }
      days.push({ weekday: r.weekday, open_min: open ?? 600, close_min: close ?? 1320, closed: r.closed });
    }
    setBusy(true);
    try {
      onSaved(await api.put<DayHoursDto[]>("/admin/hours", { days, barber_id: barberId }));
      setDirty(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="px-5 pt-4">
      <SectionTitle>Weekly hours</SectionTitle>
      {WEEK_ORDER.map((wd) => {
        const r = rows.find((x) => x.weekday === wd)!;
        return (
          <div key={wd} className="flex flex-col gap-1.5 border-b border-line py-2.5">
            <Switch
              id={`open-${wd}`}
              checked={!r.closed}
              onChange={(v) => update(wd, { closed: !v })}
              label={WEEKDAYS_LONG[wd]}
              hint={r.closed ? "Closed" : undefined}
            />
            {!r.closed && (
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 pb-1">
                <input type="time" step={300} aria-label={`${WEEKDAYS_LONG[wd]} opens`} value={r.open} onChange={(e) => update(wd, { open: e.target.value })} className="h-11 w-full min-w-0 rounded-[10px] border border-line bg-surface px-2 text-sm" />
                <span className="text-muted">to</span>
                <input type="time" step={300} aria-label={`${WEEKDAYS_LONG[wd]} closes`} value={r.close} onChange={(e) => update(wd, { close: e.target.value })} className="h-11 w-full min-w-0 rounded-[10px] border border-line bg-surface px-2 text-sm" />
              </div>
            )}
          </div>
        );
      })}
      {error && <div className="pt-3"><ErrorNote message={error} /></div>}
      {dirty && (
        <button type="button" className="btn-primary mt-3 w-full" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save hours"}
        </button>
      )}
    </section>
  );
}

function Breaks({ barberId, breaks, onChange }: { barberId: number; breaks: BreakDto[]; onChange: (b: BreakDto[]) => void }) {
  const [draft, setDraft] = useState<{ id: number | null; weekday: string; start: string; end: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const start = fromInput(draft.start);
    const end = fromInput(draft.end, true);
    if (start === null || end === null || end <= start) return setError("A break must end after it starts");
    const body = { barber_id: barberId, weekday: draft.weekday === "" ? null : Number(draft.weekday), start_min: start, end_min: end, label: draft.label || "Break" };
    try {
      onChange(draft.id ? await api.put<BreakDto[]>(`/admin/breaks/${draft.id}`, body) : await api.post<BreakDto[]>("/admin/breaks", body));
      setDraft(null);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Remove this break?")) return;
    try {
      onChange(await api.del<BreakDto[]>(`/admin/breaks/${id}`));
      setDraft(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <section className="px-5 pt-7">
      <SectionTitle
        action={
          <button type="button" className="h-10 px-2 text-sm text-[var(--accent)]" onClick={() => setDraft({ id: null, weekday: "", start: "14:00", end: "15:00", label: "Break" })}>
            + Add break
          </button>
        }
      >
        Regular breaks
      </SectionTitle>
      <div className="flex flex-col gap-2">
        {breaks.map((b) => (
          <div key={b.id} className="card flex items-center justify-between px-4 py-3">
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px]">{b.label}</span>
              <span className="text-[13px] text-muted">
                {b.weekday === null ? "Every day" : WEEKDAYS_LONG[b.weekday]} · {fmtMin(b.start_min)} – {fmtMin(b.end_min)}
              </span>
            </span>
            <button
              type="button"
              aria-label={`Edit ${b.label}`}
              className="flex size-11 items-center justify-center rounded-full border border-line"
              onClick={() => setDraft({ id: b.id, weekday: b.weekday === null ? "" : String(b.weekday), start: fmtMin(b.start_min), end: toInput(b.end_min), label: b.label })}
            >
              <Icon name="edit" size={16} />
            </button>
          </div>
        ))}
        {breaks.length === 0 && !draft && <p className="text-sm text-muted">No regular breaks.</p>}
        {draft && (
          <form onSubmit={save} className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-[var(--accent)] bg-surface p-4">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="b-label" className="text-xs font-medium">Label</label>
                <input id="b-label" className="field h-11 bg-white" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} maxLength={40} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="b-day" className="text-xs font-medium">Days</label>
                <select id="b-day" className="h-11 rounded-xl border border-field bg-white px-2 text-sm" value={draft.weekday} onChange={(e) => setDraft({ ...draft, weekday: e.target.value })}>
                  <option value="">Every day</option>
                  {WEEK_ORDER.map((wd) => (
                    <option key={wd} value={wd}>{WEEKDAYS_LONG[wd]}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="b-start" className="text-xs font-medium">From</label>
                <input id="b-start" type="time" step={300} className="h-11 rounded-xl border border-field bg-white px-2 text-sm" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="b-end" className="text-xs font-medium">To</label>
                <input id="b-end" type="time" step={300} className="h-11 rounded-xl border border-field bg-white px-2 text-sm" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
              </div>
            </div>
            {error && <ErrorNote message={error} />}
            <div className="flex items-center justify-between">
              {draft.id ? (
                <button type="button" className="h-11 text-sm text-bad-ink" onClick={() => remove(draft.id!)}>Remove</button>
              ) : <span />}
              <div className="flex gap-2">
                <button type="button" className="btn-quiet" onClick={() => { setDraft(null); setError(null); }}>Cancel</button>
                <button type="submit" className="h-11 rounded-full bg-ink px-6 text-sm text-cream">Save</button>
              </div>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function TimeOff({ barberId, items, today, onChange }: { barberId: number; items: TimeOffDto[]; today: string; onChange: () => void }) {
  const [draft, setDraft] = useState<{ date: string; allDay: boolean; start: string; end: string; reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const start = fromInput(draft.start);
    const end = fromInput(draft.end, true);
    if (!draft.allDay && (start === null || end === null || end <= start)) return setError("Time off must end after it starts");
    try {
      await api.post("/admin/time-off", { barber_id: barberId, date: draft.date, all_day: draft.allDay, start_min: start, end_min: end, reason: draft.reason });
      setDraft(null);
      setError(null);
      onChange();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Remove this time off?")) return;
    try {
      await api.del(`/admin/time-off/${id}`);
      onChange();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <section className="px-5 pt-7">
      <SectionTitle
        action={
          <button type="button" className="h-10 px-2 text-sm text-[var(--accent)]" onClick={() => setDraft({ date: today, allDay: true, start: "10:00", end: "14:00", reason: "" })}>
            + Add time off
          </button>
        }
      >
        Time off
      </SectionTitle>
      <div className="flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className="card flex items-center justify-between px-4 py-3">
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px]">{fmtDateLong(t.date)}</span>
              <span className="text-[13px] text-muted">
                {t.start_min === 0 && t.end_min === 1440 ? "Whole day" : `${fmtMin(t.start_min)} – ${fmtMin(t.end_min % 1440)}`}
                {t.reason ? ` · ${t.reason}` : ""}
              </span>
            </span>
            <button type="button" aria-label="Remove time off" className="flex size-11 items-center justify-center rounded-full border border-line" onClick={() => remove(t.id)}>
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
        {items.length === 0 && !draft && <p className="text-sm text-muted">No time off coming up.</p>}
        {draft && (
          <form onSubmit={save} className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-[var(--accent)] bg-surface p-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="t-date" className="text-xs font-medium">Date</label>
              <input id="t-date" type="date" min={today} className="h-11 rounded-xl border border-field bg-white px-2 text-sm" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} required />
            </div>
            <Switch id="t-allday" checked={draft.allDay} onChange={(v) => setDraft({ ...draft, allDay: v })} label="Whole day" />
            {!draft.allDay && (
              <div className="grid grid-cols-2 gap-2.5">
                <input type="time" step={300} aria-label="From" className="h-11 rounded-xl border border-field bg-white px-2 text-sm" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
                <input type="time" step={300} aria-label="To" className="h-11 rounded-xl border border-field bg-white px-2 text-sm" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="t-reason" className="text-xs font-medium">Reason (only you see this)</label>
              <input id="t-reason" className="field h-11 bg-white" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} maxLength={80} />
            </div>
            {error && <ErrorNote message={error} />}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-quiet" onClick={() => { setDraft(null); setError(null); }}>Cancel</button>
              <button type="submit" className="h-11 rounded-full bg-ink px-6 text-sm text-cream">Save</button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

const RULES: { key: keyof ShopSettings; label: string; hint: string; unit: string }[] = [
  { key: "buffer_min", label: "Buffer between bookings", hint: "Cleanup time after each visit", unit: "min" },
  { key: "grace_min", label: "Late grace period", hint: "Before a booking is marked late", unit: "min" },
  { key: "reminder_min", label: "Reminder", hint: "How long before to nudge you to send it", unit: "min before" },
  { key: "slot_step_min", label: "Start times every", hint: "How often a time is offered", unit: "min" },
  { key: "min_notice_min", label: "Minimum notice", hint: "Earliest online booking from now", unit: "min" },
  { key: "reopen_min", label: "Reopen freed slots", hint: "Only if at least this far away", unit: "min" },
  { key: "change_cutoff_min", label: "Customer change cutoff", hint: "No online cancelling closer than this", unit: "min" },
  { key: "booking_days_ahead", label: "Booking window", hint: "How far ahead customers can book", unit: "days" },
];

function Rules({ settings, onSaved }: { settings: ShopSettings; onSaved: (s: ShopSettings) => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(RULES.map((r) => [r.key, String(settings[r.key])])));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setError(null), [values]);

  const save = async () => {
    setBusy(true);
    try {
      onSaved(await api.put<ShopSettings>("/admin/settings", Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)]))));
      setDirty(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="px-5 pt-7 pb-8">
      <SectionTitle>Booking rules</SectionTitle>
      {RULES.map((r) => (
        <div key={r.key} className="flex min-h-14 items-center justify-between gap-3 border-b border-line py-2.5">
          <label htmlFor={`r-${r.key}`} className="flex flex-col gap-0.5">
            <span className="text-[15px]">{r.label}</span>
            <span className="text-xs text-muted">{r.hint}</span>
          </label>
          <div className="flex shrink-0 items-center gap-1.5">
            <input
              id={`r-${r.key}`}
              type="number"
              inputMode="numeric"
              min={0}
              className="h-11 w-[68px] rounded-[10px] border border-line bg-surface px-2 text-center text-sm"
              value={values[r.key]}
              onChange={(e) => {
                setValues({ ...values, [r.key]: e.target.value });
                setDirty(true);
              }}
            />
            <span className="w-[58px] text-xs text-muted">{r.unit}</span>
          </div>
        </div>
      ))}
      {error && <div className="pt-3"><ErrorNote message={error} /></div>}
      {dirty && (
        <button type="button" className="btn-primary mt-3 w-full" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save rules"}
        </button>
      )}
    </section>
  );
}
