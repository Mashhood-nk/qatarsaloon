import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { api, errorMessage } from "../../lib/api";
import { useData } from "../../lib/useData";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import type { PublicShopDto, SlotsDto } from "../../../shared/types";
import { addDays, fmtDateLong, fmtDuration, fmtMin, weekdayOf, WEEKDAYS_SHORT } from "../../../shared/time";
import { toE164 } from "../../../shared/phone";
import { money, serviceNames } from "../../lib/format";
import { ErrorNote, Spinner } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { PhoneField, type PhoneValue } from "../../components/PhoneField";

const REMEMBER_KEY = "bb:customer";

interface Remembered {
  phone: PhoneValue;
  wa: PhoneValue | null;
}

function loadRemembered(): Remembered | null {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    return raw ? (JSON.parse(raw) as Remembered) : null;
  } catch {
    return null;
  }
}

function saveRemembered(r: Remembered) {
  try {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify(r));
  } catch {
    /* private mode: fine */
  }
}

function StepHeader({ step, back, onBack }: { step: number; back?: string; onBack?: () => void }) {
  return (
    <>
      <header className="flex items-center gap-2 px-3 pt-3">
        {onBack ? (
          <button type="button" onClick={onBack} aria-label="Back" className="flex size-11 items-center justify-center rounded-full hover:bg-sand">
            <Icon name="back" size={22} />
          </button>
        ) : (
          <Link to={back ?? "/"} aria-label="Back" className="flex size-11 items-center justify-center rounded-full hover:bg-sand">
            <Icon name="back" size={22} />
          </Link>
        )}
        <span className="text-[13px] text-muted">Step {step} of 3</span>
      </header>
      <div className="grid grid-cols-3 gap-1.5 px-5 pt-2" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`h-[3px] ${i <= step ? "bg-ink" : "bg-line"}`} />
        ))}
      </div>
    </>
  );
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 mt-auto border-t border-line bg-surface/95 px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur">
      <div className="flex items-center justify-between gap-3">{children}</div>
    </div>
  );
}

export function Book() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data: shop, error, reload } = useData(() => api.get<PublicShopDto>(`/shops/${slug}`), [slug]);
  useDocumentTitle(shop ? `Book · ${shop.name}` : "Book");

  const [step, setStep] = useState(1);
  const [picked, setPicked] = useState<number[]>(() => {
    const s = Number(params.get("service"));
    return s ? [s] : [];
  });
  const [date, setDate] = useState<string | null>(null);
  const [start, setStart] = useState<number | null>(null);

  useEffect(() => {
    if (shop && !date) setDate(shop.today);
  }, [shop, date]);

  if (error) return <div className="mx-auto max-w-xl p-5"><ErrorNote message={error} onRetry={reload} /></div>;
  if (!shop || !date) return <Spinner />;

  const chosen = shop.services.filter((s) => picked.includes(s.id));
  const totalDur = chosen.reduce((t, s) => t + s.duration_min, 0);
  const totalPrice = chosen.reduce((t, s) => t + s.price, 0);
  const style = { "--accent": shop.accent } as CSSProperties;

  return (
    <div style={style} className="mx-auto flex min-h-dvh max-w-xl flex-col">
      {step === 1 && (
        <>
          <StepHeader step={1} back={`/${slug}`} />
          <div className="flex flex-col gap-2 px-5 pt-7 pb-3">
            <h1 className="display text-[38px] leading-tight">Choose services</h1>
            <p className="text-[15px] text-ink-soft">Pick one or more. Times add up automatically.</p>
          </div>
          <div className="flex flex-col gap-2.5 px-5 py-2 pb-6">
            {shop.services.map((s) => {
              const on = picked.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setPicked((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]));
                    setStart(null);
                  }}
                  className={`flex min-h-[72px] w-full items-center justify-between rounded-[14px] border-[1.5px] px-4 py-3.5 text-left transition-colors ${
                    on ? "border-[var(--accent)] bg-surface" : "border-line hover:bg-surface/60"
                  }`}
                >
                  <span className="flex flex-col gap-1">
                    <span className="text-[17px]">{s.name}</span>
                    <span className="text-[13px] text-muted">
                      {fmtDuration(s.duration_min)} · {money(s.price, shop.currency)}
                    </span>
                  </span>
                  {on ? (
                    <span className="flex size-7 items-center justify-center rounded-full bg-[var(--accent)] text-cream">
                      <Icon name="check" size={16} strokeWidth={2.2} />
                    </span>
                  ) : (
                    <span className="size-7 rounded-full border-[1.5px] border-field" />
                  )}
                </button>
              );
            })}
          </div>
          <BottomBar>
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] text-muted">
                {chosen.length} selected · {fmtDuration(totalDur)}
              </span>
              <span className="text-xl font-medium">{money(totalPrice, shop.currency)}</span>
            </div>
            <button type="button" className="btn-primary" disabled={chosen.length === 0} onClick={() => setStep(2)}>
              Continue
            </button>
          </BottomBar>
        </>
      )}

      {step === 2 && (
        <TimeStep
          shop={shop}
          serviceIds={picked}
          summary={`${serviceNames(chosen)} · ${fmtDuration(totalDur)}`}
          date={date}
          setDate={(d) => {
            setDate(d);
            setStart(null);
          }}
          start={start}
          setStart={setStart}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && start !== null && (
        <DetailsStep
          shop={shop}
          serviceIds={picked}
          summary={serviceNames(chosen)}
          price={totalPrice}
          duration={totalDur}
          date={date}
          start={start}
          onBack={() => setStep(2)}
          onTaken={() => {
            setStart(null);
            setStep(2);
          }}
          onDone={(token) => navigate(`/b/${token}?new=1`)}
        />
      )}
    </div>
  );
}

function TimeStep(props: {
  shop: PublicShopDto;
  serviceIds: number[];
  summary: string;
  date: string;
  setDate: (d: string) => void;
  start: number | null;
  setStart: (m: number) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { shop, date, start } = props;
  const days = useMemo(() => Array.from({ length: shop.booking_days_ahead + 1 }, (_, i) => addDays(shop.today, i)), [shop]);
  const usualOpen = useMemo(() => {
    const counts = new Map<number, number>();
    shop.hours.filter((h) => !h.closed).forEach((h) => counts.set(h.open_min, (counts.get(h.open_min) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }, [shop]);
  const { data, error, loading, reload } = useData(
    () => api.get<SlotsDto>(`/shops/${shop.slug}/slots?date=${date}&services=${props.serviceIds.join(",")}`),
    [date, props.serviceIds.join(",")]
  );

  const groups = useMemo(() => {
    const slots = data?.slots ?? [];
    return [
      { label: "Morning", slots: slots.filter((s) => s.start < 720) },
      { label: "Afternoon", slots: slots.filter((s) => s.start >= 720 && s.start < 1020) },
      { label: "Evening", slots: slots.filter((s) => s.start >= 1020) },
    ].filter((g) => g.slots.length > 0);
  }, [data]);
  const anyFree = data?.slots.some((s) => s.available);

  return (
    <>
      <StepHeader step={2} onBack={props.onBack} />
      <div className="flex flex-col gap-2 px-5 pt-7 pb-2">
        <h1 className="display text-[38px] leading-tight">Pick a time</h1>
        <p className="text-[15px] text-ink-soft">{props.summary}</p>
      </div>

      <div className="flex gap-2 overflow-x-auto px-5 py-4 [scrollbar-width:none]" role="listbox" aria-label="Date">
        {days.map((d) => {
          const h = shop.hours.find((x) => x.weekday === weekdayOf(d));
          const closed = !h || h.closed;
          const sel = d === date;
          const note = closed ? "Closed" : h && usualOpen !== undefined && h.open_min !== usualOpen ? `from ${fmtMin(h.open_min)}` : "";
          return (
            <button
              key={d}
              type="button"
              role="option"
              aria-selected={sel}
              disabled={closed}
              onClick={() => props.setDate(d)}
              className={`flex h-[78px] w-[64px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[14px] border transition-colors disabled:opacity-40 ${
                sel ? "border-[var(--accent)] bg-[var(--accent)] text-cream" : "border-line hover:bg-surface"
              }`}
            >
              <span className={`text-xs ${sel ? "" : "text-muted"}`}>{d === shop.today ? "Today" : WEEKDAYS_SHORT[weekdayOf(d)]}</span>
              <span className="text-xl">{Number(d.slice(8))}</span>
              {note && <span className={`text-[10px] ${sel ? "" : "text-amber-ink"}`}>{note}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-5 px-5 pt-1 pb-6">
        {error && <ErrorNote message={error} onRetry={reload} />}
        {loading && !data && <Spinner label="Loading times" />}
        {data && data.closed && <p className="text-[15px] text-muted">Closed on this day. Please pick another date.</p>}
        {data && !data.closed && !anyFree && (
          <p className="text-[15px] text-muted">No free times left on {fmtDateLong(date)}. Please try another day.</p>
        )}
        {groups.map((g) => {
          const brk = data?.breaks.filter((b) => b.start_min >= (g.slots[0]?.start ?? 0) && b.start_min <= (g.slots.at(-1)?.start ?? 0) + 60);
          return (
            <div key={g.label} className="flex flex-col gap-2.5">
              <span className="eyebrow">{g.label}</span>
              <div className="grid grid-cols-4 gap-2">
                {g.slots.map((s) => {
                  const sel = s.start === start;
                  return (
                    <button
                      key={s.start}
                      type="button"
                      disabled={!s.available}
                      aria-pressed={sel}
                      aria-label={`${fmtMin(s.start)}${s.available ? "" : ", taken"}`}
                      onClick={() => props.setStart(s.start)}
                      className={`h-[46px] rounded-xl border text-[15px] transition-colors ${
                        sel
                          ? "border-[var(--accent)] bg-[var(--accent)] text-cream"
                          : s.available
                            ? "border-line hover:bg-surface"
                            : "cursor-not-allowed border-dashed border-[#D3C9B9] text-faint line-through"
                      }`}
                    >
                      {fmtMin(s.start)}
                    </button>
                  );
                })}
              </div>
              {brk?.map((b) => (
                <span key={b.start_min} className="text-[13px] text-muted">
                  {b.label} {fmtMin(b.start_min)} – {fmtMin(b.end_min)}
                </span>
              ))}
            </div>
          );
        })}
      </div>

      <BottomBar>
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] text-muted">{fmtDateLong(date)}</span>
          <span className="text-xl font-medium">{start !== null && data ? `${fmtMin(start)} – ${fmtMin(start + data.duration_min)}` : "Choose a time"}</span>
        </div>
        <button type="button" className="btn-primary" disabled={start === null} onClick={props.onNext}>
          Continue
        </button>
      </BottomBar>
    </>
  );
}

function DetailsStep(props: {
  shop: PublicShopDto;
  serviceIds: number[];
  summary: string;
  price: number;
  duration: number;
  date: string;
  start: number;
  onBack: () => void;
  onTaken: () => void;
  onDone: (token: string) => void;
}) {
  const { shop } = props;
  const remembered = useMemo(loadRemembered, []);
  const [phone, setPhone] = useState<PhoneValue>(remembered?.phone ?? { dial: "974", local: "" });
  const [name, setName] = useState("");
  const [diffWa, setDiffWa] = useState(!!remembered?.wa);
  const [wa, setWa] = useState<PhoneValue>(remembered?.wa ?? { dial: "91", local: "" });
  const [known, setKnown] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [waError, setWaError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lookup = async (p: PhoneValue) => {
    const e164 = toE164(p.dial, p.local);
    if (!e164) return;
    try {
      const r = await api.get<{ known: boolean; first_name?: string }>(`/shops/${shop.slug}/customer?phone=${encodeURIComponent(e164)}`);
      setKnown(r.known ? (r.first_name ?? null) : null);
    } catch {
      setKnown(null);
    }
  };

  useEffect(() => {
    if (remembered?.phone.local) void lookup(remembered.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const e164 = toE164(phone.dial, phone.local);
    setPhoneError(e164 ? null : "Check the mobile number");
    const waE164 = diffWa ? toE164(wa.dial, wa.local) : null;
    setWaError(diffWa && !waE164 ? "Check the WhatsApp number" : null);
    if (!e164 || (diffWa && !waE164)) return;
    if (!known && !name.trim()) {
      setSubmitError("Please enter your name");
      return;
    }
    setBusy(true);
    try {
      const r = await api.post<{ token: string }>(`/shops/${shop.slug}/bookings`, {
        service_ids: props.serviceIds,
        date: props.date,
        start_min: props.start,
        phone: e164,
        name: name.trim(),
        whatsapp: waE164 ?? "",
      });
      saveRemembered({ phone, wa: diffWa ? wa : null });
      props.onDone(r.token);
    } catch (err) {
      const msg = errorMessage(err);
      if (msg.includes("just taken")) {
        alert(msg);
        props.onTaken();
        return;
      }
      setSubmitError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col" noValidate>
      <StepHeader step={3} onBack={props.onBack} />
      <div className="flex flex-col gap-2 px-5 pt-7 pb-2">
        <h1 className="display text-[38px] leading-tight">Your details</h1>
        <p className="text-[15px] text-ink-soft">Been here before? Enter your number and we'll recognise you.</p>
      </div>

      <div className="flex flex-col gap-[18px] px-5 py-4">
        <PhoneField
          id="mobile"
          label="Mobile number"
          value={phone}
          onChange={(v) => {
            setPhone(v);
            setKnown(null);
          }}
          onBlur={() => lookup(phone)}
          error={phoneError}
          hint={known ? <span className="text-ok-ink">Welcome back, {known}</span> : undefined}
        />
        <div className="flex flex-col gap-2">
          <label htmlFor="name" className="label">
            Name {known && <span className="font-normal text-muted">(optional)</span>}
          </label>
          <input
            id="name"
            className="field"
            autoComplete="name"
            value={name}
            placeholder={known ?? ""}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" checked={diffWa} onChange={(e) => setDiffWa(e.target.checked)} className="size-[22px] accent-[var(--accent)]" />
          <span className="text-[15px]">My WhatsApp is on a different number</span>
        </label>
        {diffWa && (
          <PhoneField
            id="wa"
            label="WhatsApp number"
            value={wa}
            onChange={setWa}
            error={waError}
            hint="Confirmations will be sent to this number."
          />
        )}
      </div>

      <div className="mx-5 mt-2 flex flex-col gap-1.5 rounded-[14px] bg-sand p-4 text-sm">
        <div className="flex justify-between gap-3">
          <span>{props.summary}</span>
          <span className="shrink-0">{money(props.price, shop.currency)}</span>
        </div>
        <div className="flex justify-between text-ink-soft">
          <span>
            {fmtDateLong(props.date)} · {fmtMin(props.start)}
          </span>
          <span>{fmtDuration(props.duration)}</span>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2.5 px-5 pt-5 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
        {submitError && <ErrorNote message={submitError} />}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "Sending…" : "Request booking"}
        </button>
        <span className="text-center text-[13px] text-muted">Pay at the shop. You'll get a confirmation on WhatsApp.</span>
      </div>
    </form>
  );
}
