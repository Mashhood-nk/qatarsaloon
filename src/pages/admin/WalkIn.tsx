import { useState } from "react";
import { useNavigate } from "react-router";
import { api, errorMessage } from "../../lib/api";
import { useData } from "../../lib/useData";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import type { AdminBookingDto, ServiceDto } from "../../../shared/types";
import { toE164 } from "../../../shared/phone";
import { fmtDuration } from "../../../shared/time";
import { BackLink, ErrorNote, Spinner, Switch } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { PhoneField, type PhoneValue } from "../../components/PhoneField";

export function WalkIn() {
  useDocumentTitle("Add walk-in");
  const navigate = useNavigate();
  const services = useData(() => api.get<ServiceDto[]>("/admin/services"), []);
  const free = useData(() => api.get<{ free_min: number; buffer_min: number }>("/admin/free-now"), []);
  const [picked, setPicked] = useState<number[]>([]);
  const [guest, setGuest] = useState(false);
  const [phone, setPhone] = useState<PhoneValue>({ dial: "974", local: "" });
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (services.error) return <div className="p-5"><ErrorNote message={services.error} onRetry={services.reload} /></div>;
  if (!services.data) return <Spinner />;

  const active = services.data.filter((s) => s.active);
  const dur = active.filter((s) => picked.includes(s.id)).reduce((t, s) => t + s.duration_min, 0);
  const freeMin = free.data?.free_min;
  const fits = freeMin === undefined || dur === 0 ? null : dur <= freeMin;

  const submit = async (startNow: boolean) => {
    setError(null);
    let e164: string | null = null;
    if (!guest && phone.local.trim()) {
      e164 = toE164(phone.dial, phone.local);
      if (!e164) {
        setError("Check the mobile number, or leave it empty");
        return;
      }
    }
    setBusy(true);
    try {
      await api.post<AdminBookingDto>("/admin/walkins", {
        service_ids: picked,
        phone: e164 ?? "",
        name: guest ? "" : name.trim(),
        start_now: startNow,
      });
      navigate("/admin");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="flex items-center gap-2 px-3 pt-3">
        <BackLink to="/admin" label="Back to today" />
        <span className="text-[13px] text-muted">Today</span>
      </header>
      <h1 className="display px-5 pt-3 pb-2 text-[36px]">Add walk-in</h1>

      <section className="flex flex-col gap-2.5 px-5 py-2">
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
        {fits !== null && (
          <div className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[13px] leading-snug ${fits ? "bg-ok-bg text-ok-ink" : "bg-amber-bg text-amber-ink"}`}>
            <Icon name={fits ? "check" : "info"} size={18} className="shrink-0" />
            <span>
              {freeMin === 0
                ? `Someone is in the chair or a break is on. "Add to queue" puts this ${fmtDuration(dur)} visit in the next free gap.`
                : fits
                  ? `${fmtDuration(dur)} fits now. You have ${fmtDuration(freeMin!)} free, including the ${free.data?.buffer_min}-min buffer.`
                  : `Only ${fmtDuration(freeMin!)} free before the next booking. "Add to queue" finds the next gap.`}
            </span>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4 px-5 pt-3">
        <div className="rounded-xl border border-line bg-surface px-3.5">
          <Switch id="guest" checked={guest} onChange={setGuest} label="Add as guest (no details)" />
        </div>
        {guest ? (
          <p className="text-sm leading-relaxed text-ink-soft">The visit is still timed and counted. You can add their details later if they come back.</p>
        ) : (
          <>
            <PhoneField id="w-mobile" label="Mobile number" value={phone} onChange={setPhone} placeholder="Optional" hint="If they've visited before, their profile and notes are linked." />
            <div className="flex flex-col gap-2">
              <label htmlFor="w-name" className="label">
                Name
              </label>
              <input id="w-name" className="field" placeholder="Optional" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </div>
          </>
        )}
      </section>

      <div className="flex flex-col gap-2.5 px-5 pt-6 pb-6">
        {error && <ErrorNote message={error} />}
        <button type="button" className="btn-primary w-full" disabled={busy || picked.length === 0} onClick={() => submit(true)}>
          Start now
        </button>
        <button type="button" className="btn-outline w-full" disabled={busy || picked.length === 0} onClick={() => submit(false)}>
          Add to queue instead
        </button>
      </div>
    </>
  );
}
