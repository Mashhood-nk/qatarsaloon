import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api, errorMessage } from "../../lib/api";
import { useData } from "../../lib/useData";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import type { AdminBookingDto, CustomerDto } from "../../../shared/types";
import { fmtPhone, splitE164, toE164 } from "../../../shared/phone";
import { fmtDateShort, fmtDateLong } from "../../../shared/time";
import { serviceNames } from "../../lib/format";
import { actualMinutes } from "../../lib/live";
import { BackLink, ErrorNote, Pill, Row, SectionTitle, Spinner, Toast } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { PhoneField, type PhoneValue } from "../../components/PhoneField";

const toValue = (e164: string | null, fallbackDial: string): PhoneValue => {
  if (!e164) return { dial: fallbackDial, local: "" };
  const s = splitE164(e164);
  return { dial: s.dial || fallbackDial, local: s.local };
};

export function CustomerDetail() {
  const { id = "" } = useParams();
  const { data, error, reload, setData } = useData(
    () => api.get<{ customer: CustomerDto; history: AdminBookingDto[] }>(`/admin/customers/${id}`),
    [id]
  );
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useDocumentTitle(data?.customer.name || "Customer");

  if (error && !data) return <div className="p-5"><ErrorNote message={error} onRetry={reload} /></div>;
  if (!data) return <Spinner />;
  const { customer: c, history } = data;
  const done = history.filter((h) => h.status === "done");
  const noShows = history.filter((h) => h.status === "no_show").length;
  const gaps = done
    .map((h) => h.date)
    .sort()
    .map((d, i, arr) => (i === 0 ? null : (Date.parse(d) - Date.parse(arr[i - 1])) / 86400000))
    .filter((x): x is number => x !== null && x > 0);
  const usualGap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;

  return (
    <>
      <header className="flex items-center justify-between px-3 pt-3">
        <BackLink to="/admin/customers" label="Back to customers" />
        {!editing && (
          <button type="button" className="btn-quiet mr-2" onClick={() => setEditing(true)}>
            <Icon name="edit" size={16} /> Edit
          </button>
        )}
      </header>

      <div className="flex items-center gap-4 px-5 pt-3 pb-2">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] font-[family-name:var(--font-display)] text-2xl text-cream">
          {(c.name || "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="display truncate text-[32px] leading-tight">{c.name || "No name"}</h1>
          <span className="text-[13px] text-muted">{c.is_guest ? "Guest" : `Customer since ${fmtDateShort(c.created_at.slice(0, 10))}`}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 px-5 py-3">
        <Stat value={String(done.length)} label="Visits" />
        <Stat value={usualGap ? `~${usualGap < 14 ? `${usualGap} d` : `${Math.round(usualGap / 7)} wk`}` : "–"} label="Usual gap" />
        <Stat value={String(noShows)} label="No-shows" />
      </div>

      {editing ? (
        <EditForm
          c={c}
          onCancel={() => setEditing(false)}
          onSaved={(nc) => {
            setData({ ...data, customer: nc });
            setEditing(false);
            setToast("Saved");
          }}
        />
      ) : (
        <>
          <div className="card mx-5 flex flex-col gap-3 p-[18px]">
            <Row label="Mobile (ID)">{c.phone ? fmtPhone(c.phone) : "—"}</Row>
            <Row label="WhatsApp">{c.whatsapp ? fmtPhone(c.whatsapp) : "Same as mobile"}</Row>
          </div>
          <section className="px-5 pt-5">
            <SectionTitle>Preferences</SectionTitle>
            {c.prefs.length ? (
              <div className="flex flex-wrap gap-2">
                {c.prefs.map((p) => (
                  <span key={p} className="rounded-full bg-sand px-3 py-2 text-[13px]">
                    {p}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">None yet. Tap Edit to add things like "skin fade, #2 on sides".</p>
            )}
            {c.notes && (
              <>
                <div className="pt-4" />
                <SectionTitle>Notes</SectionTitle>
                <p className="text-[15px] leading-relaxed whitespace-pre-line">{c.notes}</p>
              </>
            )}
          </section>
        </>
      )}

      <section className="flex flex-col px-5 pt-6 pb-6">
        <SectionTitle>Visit history</SectionTitle>
        {history.length === 0 && <p className="text-sm text-muted">No visits yet.</p>}
        {history.map((h) => (
          <Link key={h.id} to={`/admin/bookings/${h.id}`} className="flex items-center justify-between gap-3 border-b border-line py-3">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px]">{fmtDateLong(h.date)}</span>
              <span className="truncate text-xs text-muted">{serviceNames(h.services)}</span>
            </span>
            {h.status === "done" ? (
              <span className="shrink-0 text-[13px] text-ink-soft">{actualMinutes(h) ? `${actualMinutes(h)} min` : "Done"}</span>
            ) : h.status === "no_show" ? (
              <Pill tone="bad">No-show</Pill>
            ) : h.status === "cancelled" || h.status === "declined" ? (
              <span className="shrink-0 text-xs text-muted capitalize">{h.status}</span>
            ) : (
              <span className="shrink-0 text-xs text-muted">Upcoming</span>
            )}
          </Link>
        ))}
      </section>
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] bg-surface p-3.5">
      <span className="text-[22px]">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

function EditForm({ c, onCancel, onSaved }: { c: CustomerDto; onCancel: () => void; onSaved: (c: CustomerDto) => void }) {
  const [name, setName] = useState(c.name);
  const [phone, setPhone] = useState<PhoneValue>(toValue(c.phone, "974"));
  const [wa, setWa] = useState<PhoneValue>(toValue(c.whatsapp, "91"));
  const [prefs, setPrefs] = useState<string[]>(c.prefs);
  const [newPref, setNewPref] = useState("");
  const [notes, setNotes] = useState(c.notes);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setError(null), [name, phone, wa, notes]);

  const addPref = () => {
    const p = newPref.trim();
    if (p && !prefs.includes(p)) setPrefs([...prefs, p]);
    setNewPref("");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const phoneE = phone.local.trim() ? toE164(phone.dial, phone.local) : "";
    const waE = wa.local.trim() ? toE164(wa.dial, wa.local) : "";
    if (phoneE === null) return setError("Check the mobile number");
    if (waE === null) return setError("Check the WhatsApp number");
    setBusy(true);
    try {
      const pending = newPref.trim() && !prefs.includes(newPref.trim()) ? [...prefs, newPref.trim()] : prefs;
      onSaved(await api.put<CustomerDto>(`/admin/customers/${c.id}`, { name, phone: phoneE, whatsapp: waE, prefs: pending, notes }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-4 px-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="c-name" className="label">
          Name
        </label>
        <input id="c-name" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </div>
      <PhoneField id="c-phone" label="Mobile number (their ID)" value={phone} onChange={setPhone} />
      <PhoneField id="c-wa" label="WhatsApp number (if different)" value={wa} onChange={setWa} placeholder="Leave empty if same" />
      <div className="flex flex-col gap-2">
        <span className="label">Preferences</span>
        <div className="flex flex-wrap gap-2">
          {prefs.map((p) => (
            <button key={p} type="button" onClick={() => setPrefs(prefs.filter((x) => x !== p))} className="flex h-9 items-center gap-1.5 rounded-full bg-sand px-3 text-[13px]" aria-label={`Remove ${p}`}>
              {p} <Icon name="close" size={14} />
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="field h-12"
            placeholder='e.g. "skin fade", "#2 on sides"'
            value={newPref}
            onChange={(e) => setNewPref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addPref();
              }
            }}
            maxLength={40}
            aria-label="New preference"
          />
          <button type="button" className="btn-quiet h-12 shrink-0" onClick={addPref}>
            Add
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="c-notes" className="label">
          Notes
        </label>
        <textarea id="c-notes" rows={4} className="resize-none rounded-xl border border-field bg-surface px-3.5 py-3 text-[15px] leading-relaxed outline-none focus:border-ink" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
      </div>
      {error && <ErrorNote message={error} />}
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" className="btn-outline" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
