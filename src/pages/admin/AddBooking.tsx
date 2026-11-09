// One screen for adding a visit: "Now" (walk-in) or "Later" (booked on the phone).
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { api, ApiError, errorMessage } from "../../lib/api";
import { useData } from "../../lib/useData";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import type { AdminBookingDto, CustomerDto, ServiceDto, SlotsDto } from "../../../shared/types";
import { toE164 } from "../../../shared/phone";
import { addDays, fmtDateLong, fmtDuration, fmtMin, nowInZone, parseHHMM, weekdayOf, WEEKDAYS_SHORT } from "../../../shared/time";
import { serviceNames } from "../../lib/format";
import { customerWhatsApp, messages, openWhatsApp } from "../../lib/messages";
import { BackLink, ErrorNote, Spinner, Switch } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { PhoneField, type PhoneValue } from "../../components/PhoneField";
import { BarberChips, useAdmin } from "./AdminLayout";

type Mode = "now" | "later";
type Found = (CustomerDto & { visits: number }) | null;

export function AddBooking() {
  useDocumentTitle("Add booking");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { shop, shopInfo, defaultBarberId, isOwner, barbers } = useAdmin();
  const [mode, setMode] = useState<Mode>(params.get("mode") === "now" ? "now" : "later");
  const [barber, setBarber] = useState<number | null>(defaultBarberId);
  const [picked, setPicked] = useState<number[]>([]);
  const [phone, setPhone] = useState<PhoneValue>({ dial: "974", local: "" });
  const [name, setName] = useState("");
  const [guest, setGuest] = useState(false);
  const [diffWa, setDiffWa] = useState(false);
  const [wa, setWa] = useState<PhoneValue>({ dial: "91", local: "" });
  const [found, setFound] = useState<Found>(null);
  const today = useMemo(() => nowInZone(shop.timezone).date, [shop.timezone]);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState<number | null>(null);
  const [customTime, setCustomTime] = useState("");
  const [clash, setClash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<AdminBookingDto | null>(null);

  const services = useData(() => api.get<ServiceDto[]>("/admin/services"), []);
  const free = useData(() => api.get<{ free_min: number; buffer_min: number }>(`/admin/free-now?barber=${barber ?? ""}`), [barber, mode]);
  const slots = useData(
    async () => (picked.length && mode === "later" ? api.get<SlotsDto>(`/admin/slots?date=${date}&services=${picked.join(",")}&barber=${barber ?? ""}`) : null),
    [date, picked.join(","), barber, mode]
  );

  // Changing anything that affects the time clears the chosen time and any warning.
  useEffect(() => {
    setStart(null);
    setCustomTime("");
    setClash(null);
  }, [date, picked.join(","), barber]);
  useEffect(() => setClash(null), [start]);

  const lookup = async () => {
    const e164 = toE164(phone.dial, phone.local);
    if (!e164) return setFound(null);
    try {
      const c = await api.get<Found>(`/admin/customers-lookup?phone=${encodeURIComponent(e164)}`);
      setFound(c);
      if (c && !name.trim()) setName(c.name);
    } catch {
      setFound(null);
    }
  };

  if (services.error) return <div className="p-5"><ErrorNote message={services.error} onRetry={services.reload} /></div>;
  if (!services.data) return <Spinner />;
  if (saved) return <Saved b={saved} onDone={() => navigate("/admin")} onAnother={() => window.location.reload()} shopInfo={shopInfo} showBarber={barbers.length > 1} />;

  const active = services.data.filter((s) => s.active);
  const chosen = active.filter((s) => picked.includes(s.id));
  const dur = chosen.reduce((t, s) => t + s.duration_min, 0);
  const freeMin = free.data?.free_min;
  const fits = freeMin === undefined || dur === 0 ? null : dur <= freeMin;
  const days = Array.from({ length: 15 }, (_, i) => addDays(today, i));
  const barberName = barbers.find((b) => b.id === barber)?.name;

  const customer = () => {
    setError(null);
    let e164: string | null = null;
    if (!guest && phone.local.trim()) {
      e164 = toE164(phone.dial, phone.local);
      if (!e164) {
        setError("Check the mobile number, or leave it empty");
        return null;
      }
    }
    let waE164: string | null = null;
    if (!guest && diffWa && wa.local.trim()) {
      waE164 = toE164(wa.dial, wa.local);
      if (!waE164) {
        setError("Check the WhatsApp number");
        return null;
      }
    }
    return { phone: e164 ?? "", whatsapp: waE164 ?? "", name: guest ? "" : name.trim() };
  };

  const saveNow = async (startNow: boolean) => {
    const c = customer();
    if (!c) return;
    setBusy(true);
    try {
      await api.post<AdminBookingDto>("/admin/walkins", { service_ids: picked, barber_id: barber, phone: c.phone, name: c.name, start_now: startNow });
      navigate("/admin");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const saveLater = async (force: boolean) => {
    const c = customer();
    if (!c) return;
    if (start === null) return setError("Pick a time");
    if (!c.phone && !c.name) return setError("Add the customer's mobile number, or at least a name");
    setBusy(true);
    try {
      const b = await api.post<AdminBookingDto>("/admin/bookings", { ...c, service_ids: picked, barber_id: barber, date, start_min: start, force });
      setSaved(b);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.data?.clash) setClash(e.message);
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const groups = (() => {
    const list = slots.data?.slots ?? [];
    return [
      { label: "Morning", items: list.filter((s) => s.start < 720) },
      { label: "Afternoon", items: list.filter((s) => s.start >= 720 && s.start < 1020) },
      { label: "Evening", items: list.filter((s) => s.start >= 1020) },
    ].filter((g) => g.items.length);
  })();

  return (
    <>
      <header className="flex items-center gap-2 px-3 pt-3">
        <BackLink to="/admin" label="Back to today" />
        <span className="text-[13px] text-muted">Today</span>
      </header>
      <h1 className="display px-5 pt-3 pb-3 text-[36px]">Add booking</h1>

      <div className="mx-5 grid grid-cols-2 gap-1 rounded-full bg-sand p-1" role="radiogroup" aria-label="When">
        {(
          [
            ["now", "Now (walk-in)"],
            ["later", "Later (phone)"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`h-11 rounded-full text-sm font-medium transition-colors ${mode === m ? "bg-surface shadow-sm" : "text-ink-soft"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {isOwner && barber !== null && (
        <div className="pt-3">
          <BarberChips value={barber} onChange={(v) => v !== "all" && setBarber(v)} label="Barber" />
        </div>
      )}

      <section className="flex flex-col gap-2.5 px-5 pt-4">
        <span className="label">Services</span>
        <div className="flex flex-wrap gap-2">
          {active.map((s) => {
            const on = picked.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                onClick={() => setPicked((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                className={`h-11 rounded-full border px-4 text-sm ${on ? "border-[var(--accent)] bg-[var(--accent)] text-cream" : "border-field"}`}
              >
                {s.name}
              </button>
            );
          })}
        </div>
        {dur > 0 && <span className="text-[13px] text-muted">{fmtDuration(dur)} in total</span>}
      </section>

      {mode === "now" && fits !== null && (
        <div className={`mx-5 mt-3 flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[13px] leading-snug ${fits ? "bg-ok-bg text-ok-ink" : "bg-amber-bg text-amber-ink"}`}>
          <Icon name={fits ? "check" : "info"} size={18} className="shrink-0" />
          <span>
            {freeMin === 0
              ? `Someone is in the chair or a break is on. "Add to queue" puts this ${fmtDuration(dur)} visit in the next free gap.`
              : fits
                ? `${fmtDuration(dur)} fits now. ${fmtDuration(freeMin!)} free, including the ${free.data?.buffer_min}-min buffer.`
                : `Only ${fmtDuration(freeMin!)} free before the next booking. "Add to queue" finds the next gap.`}
          </span>
        </div>
      )}

      {mode === "later" && (
        <section className="flex flex-col gap-3 pt-5">
          <span className="label px-5">Date</span>
          <div className="flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]" role="listbox" aria-label="Date">
            {days.map((d) => {
              const sel = d === date;
              return (
                <button
                  key={d}
                  type="button"
                  role="option"
                  aria-selected={sel}
                  onClick={() => setDate(d)}
                  className={`flex h-[70px] w-[58px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[14px] border ${
                    sel ? "border-[var(--accent)] bg-[var(--accent)] text-cream" : "border-line"
                  }`}
                >
                  <span className={`text-xs ${sel ? "" : "text-muted"}`}>{d === today ? "Today" : WEEKDAYS_SHORT[weekdayOf(d)]}</span>
                  <span className="text-lg">{Number(d.slice(8))}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 px-5">
            <span className="label">Time</span>
            {picked.length === 0 && <p className="text-sm text-muted">Choose services first to see free times.</p>}
            {slots.error && <ErrorNote message={slots.error} onRetry={slots.reload} />}
            {picked.length > 0 && !slots.data && !slots.error && <Spinner label="Loading times" />}
            {slots.data?.closed && (
              <p className="text-sm text-muted">{barberName && barbers.length > 1 ? `${barberName} isn't` : "Not"} working on {fmtDateLong(date)}. You can still type a time below.</p>
            )}
            {groups.map((g) => (
              <div key={g.label} className="flex flex-col gap-2">
                <span className="text-xs text-muted">{g.label}</span>
                <div className="grid grid-cols-4 gap-2">
                  {g.items.map((s) => {
                    const sel = s.start === start && !customTime;
                    return (
                      <button
                        key={s.start}
                        type="button"
                        aria-pressed={sel}
                        aria-label={`${fmtMin(s.start)}${s.available ? "" : ", taken"}`}
                        onClick={() => {
                          setCustomTime("");
                          setStart(s.start);
                        }}
                        className={`h-11 rounded-xl border text-[15px] ${
                          sel
                            ? "border-[var(--accent)] bg-[var(--accent)] text-cream"
                            : s.available
                              ? "border-line"
                              : "border-dashed border-[#D3C9B9] text-faint line-through"
                        }`}
                      >
                        {fmtMin(s.start)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {picked.length > 0 && (
              <label className="flex items-center justify-between gap-3 pt-1">
                <span className="text-sm text-ink-soft">Or another time</span>
                <input
                  type="time"
                  step={300}
                  value={customTime}
                  onChange={(e) => {
                    setCustomTime(e.target.value);
                    setStart(parseHHMM(e.target.value));
                  }}
                  className="h-11 w-[130px] rounded-xl border border-field bg-surface px-2 text-sm"
                  aria-label="Another time"
                />
              </label>
            )}
            <p className="text-xs text-muted">Crossed-out times are taken. You can still pick one; you'll get a warning first.</p>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4 px-5 pt-6">
        <span className="label">Customer</span>
        {mode === "now" && (
          <div className="rounded-xl border border-line bg-surface px-3.5">
            <Switch id="guest" checked={guest} onChange={setGuest} label="Add as guest (no details)" />
          </div>
        )}
        {!guest && (
          <>
            <PhoneField
              id="b-mobile"
              label="Mobile number"
              value={phone}
              onChange={(v) => {
                setPhone(v);
                setFound(null);
              }}
              onBlur={lookup}
              placeholder={mode === "later" ? "For the WhatsApp message" : "Optional"}
              hint={
                found ? (
                  <span className="text-ok-ink">
                    {found.name || "Returning customer"} · {found.visits} visit{found.visits === 1 ? "" : "s"}
                  </span>
                ) : undefined
              }
            />
            {found && (found.prefs.length > 0 || found.notes) && (
              <div className="rounded-xl bg-sand px-3.5 py-3 text-[13px] leading-relaxed">
                {found.prefs.length > 0 && <div>{found.prefs.join(" · ")}</div>}
                {found.notes && <div className="text-ink-soft">{found.notes}</div>}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label htmlFor="b-name" className="label">
                Name
              </label>
              <input id="b-name" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Optional if you add the number" />
            </div>
            {mode === "later" && (
              <>
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={diffWa} onChange={(e) => setDiffWa(e.target.checked)} className="size-[22px] accent-[var(--accent)]" />
                  <span className="text-[15px]">WhatsApp is on a different number</span>
                </label>
                {diffWa && <PhoneField id="b-wa" label="WhatsApp number" value={wa} onChange={setWa} />}
              </>
            )}
          </>
        )}
      </section>

      <div className="flex flex-col gap-2.5 px-5 pt-6 pb-8">
        {error && <ErrorNote message={error} />}
        {mode === "now" ? (
          <>
            <button type="button" className="btn-primary w-full" disabled={busy || picked.length === 0} onClick={() => saveNow(true)}>
              Start now
            </button>
            <button type="button" className="btn-outline w-full" disabled={busy || picked.length === 0} onClick={() => saveNow(false)}>
              Add to queue
            </button>
          </>
        ) : clash ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-line bg-amber-bg p-4" role="alert">
            <div className="flex items-start gap-2.5 text-amber-ink">
              <Icon name="info" className="mt-px shrink-0" />
              <span className="text-sm leading-snug">
                <b>{clash}</b> Book {start !== null ? fmtMin(start) : "it"} anyway?
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="h-11 rounded-full border border-amber-ink/40 text-sm text-amber-ink" onClick={() => setClash(null)}>
                Pick another time
              </button>
              <button type="button" className="h-11 rounded-full bg-amber-ink text-sm text-[#FFF8EC] disabled:opacity-50" disabled={busy} onClick={() => saveLater(true)}>
                Book anyway
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn-primary w-full" disabled={busy || picked.length === 0 || start === null} onClick={() => saveLater(false)}>
            {start !== null ? `Book ${fmtDateLong(date).split(" ").slice(0, 2).join(" ")} at ${fmtMin(start)}` : "Book"}
          </button>
        )}
        {mode === "later" && chosen.length > 0 && start !== null && !clash && (
          <span className="text-center text-xs text-muted">
            {serviceNames(chosen)} · {fmtDuration(dur)}
            {barbers.length > 1 && barberName ? ` · ${barberName}` : ""}. Saved as confirmed.
          </span>
        )}
      </div>
    </>
  );
}

function Saved({
  b,
  shopInfo,
  showBarber,
  onDone,
  onAnother,
}: {
  b: AdminBookingDto;
  shopInfo: { slug: string; name: string; address: string };
  showBarber: boolean;
  onDone: () => void;
  onAnother: () => void;
}) {
  const to = customerWhatsApp(b);
  const [sent, setSent] = useState(false);
  return (
    <div className="flex min-h-[70dvh] flex-col px-5 pt-14">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-[72px] items-center justify-center rounded-full border-[1.5px] border-[var(--accent)] text-[var(--accent)]">
          <Icon name="check" size={32} />
        </span>
        <h1 className="display text-[38px] leading-tight">Booked</h1>
        <p className="text-[15px] leading-relaxed text-ink-soft">
          {b.customer?.name || "Customer"} · {serviceNames(b.services)}
          <br />
          {fmtDateLong(b.date)} at {fmtMin(b.start_min)}
          {showBarber ? ` with ${b.barber_name}` : ""}
        </p>
      </div>
      <div className="mt-8 flex flex-col gap-2.5">
        {to ? (
          <>
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => {
                openWhatsApp(to, messages.confirm(b, shopInfo));
                setSent(true);
              }}
            >
              <Icon name="whatsapp" size={18} /> {sent ? "Open WhatsApp again" : "Send confirmation on WhatsApp"}
            </button>
            <p className="text-center text-xs text-muted">Includes their booking link, so they can check or cancel it themselves.</p>
          </>
        ) : (
          <p className="text-center text-sm text-muted">No number saved, so no WhatsApp confirmation can be sent.</p>
        )}
        <button type="button" className="btn-outline mt-2 w-full" onClick={onDone}>
          Done
        </button>
        <button type="button" className="h-11 text-sm text-muted underline" onClick={onAnother}>
          Add another booking
        </button>
      </div>
    </div>
  );
}
