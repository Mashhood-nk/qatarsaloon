import { useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { useData } from "../../lib/useData";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import type { ServiceDto } from "../../../shared/types";
import { fmtDuration } from "../../../shared/time";
import { money } from "../../lib/format";
import { ErrorNote, Spinner, Switch } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { useAdmin } from "./AdminLayout";

type Draft = { id: number | null; name: string; duration: string; price: string; active: boolean };

export function Services() {
  useDocumentTitle("Services");
  const { shop } = useAdmin();
  const { data, error, reload, setData } = useData(() => api.get<ServiceDto[]>("/admin/services"), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (error && !data) return <div className="p-5"><ErrorNote message={error} onRetry={reload} /></div>;
  if (!data) return <Spinner />;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setFormError(null);
    const body = { name: draft.name, duration_min: Number(draft.duration), price: Number(draft.price), active: draft.active };
    try {
      setData(draft.id ? await api.put<ServiceDto[]>(`/admin/services/${draft.id}`, body) : await api.post<ServiceDto[]>("/admin/services", body));
      setDraft(null);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft?.id || !confirm(`Remove "${draft.name}"? Past bookings keep it in their history.`)) return;
    setBusy(true);
    try {
      setData(await api.del<ServiceDto[]>(`/admin/services/${draft.id}`));
      setDraft(null);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleShown = async (s: ServiceDto, active: boolean) => {
    try {
      setData(await api.put<ServiceDto[]>(`/admin/services/${s.id}`, { name: s.name, duration_min: s.duration_min, price: s.price, active }));
    } catch (err) {
      alert(errorMessage(err));
    }
  };

  const form = draft && (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-[var(--accent)] bg-surface p-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="s-name" className="text-xs font-medium">
          Name
        </label>
        <input id="s-name" className="field h-12 bg-white" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={60} required autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="s-dur" className="text-xs font-medium">
            Duration (min)
          </label>
          <input id="s-dur" type="number" inputMode="numeric" min={5} max={480} step={5} className="field h-12 bg-white" value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="s-price" className="text-xs font-medium">
            Price ({shop.currency})
          </label>
          <input id="s-price" type="number" inputMode="decimal" min={0} step="any" className="field h-12 bg-white" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} required />
        </div>
      </div>
      {formError && <ErrorNote message={formError} />}
      <div className="flex items-center justify-between gap-2.5">
        {draft.id ? (
          <button type="button" className="h-11 px-1 text-sm text-bad-ink" onClick={remove} disabled={busy}>
            Remove
          </button>
        ) : (
          <button type="button" className="h-11 px-1 text-sm text-muted" onClick={() => setDraft(null)}>
            Cancel
          </button>
        )}
        <div className="flex gap-2">
          {draft.id && (
            <button type="button" className="btn-quiet" onClick={() => setDraft(null)}>
              Cancel
            </button>
          )}
          <button type="submit" className="h-11 rounded-full bg-ink px-6 text-sm text-cream disabled:opacity-50" disabled={busy}>
            Save
          </button>
        </div>
      </div>
    </form>
  );

  return (
    <>
      <header className="flex items-end justify-between px-5 pt-6 pb-2">
        <h1 className="display text-[36px]">Services</h1>
        <button
          type="button"
          className="flex h-11 items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 text-sm text-cream"
          onClick={() => {
            setFormError(null);
            setDraft({ id: null, name: "", duration: "30", price: "", active: true });
          }}
        >
          <Icon name="plus" size={16} /> Add service
        </button>
      </header>
      <p className="px-5 pb-3 text-sm text-muted">Changes show on your booking page straight away.</p>

      <div className="flex flex-col px-5 pb-6">
        {draft && !draft.id && <div className="mb-3">{form}</div>}
        {data.map((s) =>
          draft?.id === s.id ? (
            <div key={s.id} className="my-2">
              {form}
            </div>
          ) : (
            <div key={s.id} className="flex min-h-[64px] items-center gap-3 border-b border-line py-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={`text-base ${s.active ? "" : "text-muted"}`}>{s.name}</span>
                <span className="text-[13px] text-muted">
                  {fmtDuration(s.duration_min)} · {money(s.price, shop.currency)}
                </span>
              </div>
              <div className="w-[84px] shrink-0">
                <Switch id={`shown-${s.id}`} checked={s.active} onChange={(v) => toggleShown(s, v)} label={<span className="text-xs text-ink-soft">Shown</span>} />
              </div>
              <button
                type="button"
                aria-label={`Edit ${s.name}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line"
                onClick={() => {
                  setFormError(null);
                  setDraft({ id: s.id, name: s.name, duration: String(s.duration_min), price: String(s.price), active: s.active });
                }}
              >
                <Icon name="edit" size={16} />
              </button>
            </div>
          )
        )}
        {data.length === 0 && !draft && <p className="py-6 text-[15px] text-muted">No services yet. Add your first one.</p>}
      </div>
    </>
  );
}
