// Platform admin: every shop on qatarsaloon, adding shops, pausing them, and opening their admin.
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { api, ApiError, errorMessage } from "../../lib/api";
import { useData } from "../../lib/useData";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import type { MeDto, PlatformShopDto } from "../../../shared/types";
import { fmtDateShort } from "../../../shared/time";
import { ErrorNote, Pill, Spinner, Switch, Toast } from "../../components/ui";
import { Icon } from "../../components/Icon";

type Gate = { kind: "ok"; me: MeDto } | { kind: "out" } | { kind: "notPlatform" };

export function Platform() {
  useDocumentTitle("Platform");
  const gate = useData<Gate>(async () => {
    try {
      const me = await api.get<MeDto>("/auth/me");
      return me.user.role === "platform" ? { kind: "ok", me } : { kind: "notPlatform" };
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return { kind: "out" };
      throw e;
    }
  }, []);
  if (gate.loading && !gate.data) return <Spinner />;
  if (gate.error && !gate.data) return <div className="p-5"><ErrorNote message={gate.error} onRetry={gate.reload} /></div>;
  if (!gate.data || gate.data.kind === "out") return <Navigate to="/admin/login" replace />;
  if (gate.data.kind === "notPlatform") return <Navigate to="/admin" replace />;
  return <PlatformHome me={gate.data.me} />;
}

function PlatformHome({ me }: { me: MeDto }) {
  const navigate = useNavigate();
  const { data, error, reload, setData } = useData(() => api.get<PlatformShopDto[]>("/platform/shops"), []);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const enter = async (id: number) => {
    try {
      await api.post(`/platform/shops/${id}/enter`);
      navigate("/admin");
    } catch (e) {
      setToast(errorMessage(e));
    }
  };

  const logout = async () => {
    await api.post("/auth/logout").catch(() => {});
    navigate("/admin/login", { replace: true });
  };

  const active = data?.filter((s) => s.active).length ?? 0;
  const bookings = data?.reduce((t, s) => t + s.bookings_30d, 0) ?? 0;

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col" style={{ ["--accent" as string]: "#24211C" }}>
      <header className="flex items-start justify-between gap-3 px-5 pt-6 pb-2">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-muted">qatarsaloon · platform admin</span>
          <h1 className="display text-[36px] leading-none">Shops</h1>
        </div>
        <button type="button" className="btn-quiet" onClick={logout} aria-label={`Log out ${me.user.username}`}>
          <Icon name="logout" size={16} /> Log out
        </button>
      </header>

      {data && (
        <div className="grid grid-cols-3 gap-2 px-5 pt-3">
          <Stat value={String(data.length)} label="Shops" />
          <Stat value={String(active)} label="Active" />
          <Stat value={String(bookings)} label="Bookings 30 d" />
        </div>
      )}

      <div className="px-5 pt-4">
        {!adding && (
          <button type="button" className="btn-primary w-full" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} /> Add a shop
          </button>
        )}
        {adding && (
          <AddShop
            onCancel={() => setAdding(false)}
            onAdded={(list, name) => {
              setData(list);
              setAdding(false);
              setToast(`${name} created`);
            }}
          />
        )}
      </div>

      <section className="flex flex-col gap-3 px-5 pt-5 pb-10">
        {error && !data && <ErrorNote message={error} onRetry={reload} />}
        {!data && !error && <Spinner />}
        {data?.map((s) =>
          editing === s.id ? (
            <EditShop
              key={s.id}
              s={s}
              onCancel={() => setEditing(null)}
              onSaved={(list, msg) => {
                setData(list);
                setEditing(null);
                setToast(msg);
              }}
            />
          ) : (
            <div key={s.id} className={`card flex flex-col gap-3 p-4 ${s.active ? "" : "opacity-70"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2 text-base font-medium">
                    {s.name}
                    {!s.active && <Pill tone="bad">Paused</Pill>}
                    <Pill tone="neutral">{s.plan}</Pill>
                  </span>
                  <a href={`/${s.slug}`} target="_blank" rel="noreferrer" className="truncate text-[13px] text-ink-soft underline">
                    qatarsaloon.com/{s.slug}
                  </a>
                  <span className="text-[13px] text-muted">
                    {s.owner ? `Owner: ${s.owner.name} (${s.owner.username})` : "No owner login"}
                    {s.area ? ` · ${s.area}` : ""}
                  </span>
                </div>
                <button type="button" aria-label={`Edit ${s.name}`} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line" onClick={() => setEditing(s.id)}>
                  <Icon name="edit" size={16} />
                </button>
              </div>
              <div className="flex gap-4 text-[13px] text-ink-soft">
                <span>{s.barbers} barber{s.barbers === 1 ? "" : "s"}</span>
                <span>{s.customers} customers</span>
                <span>{s.bookings_30d} bookings (30 d)</span>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
                <span className="text-xs text-muted">Since {fmtDateShort(s.created_at.slice(0, 10))}</span>
                <button type="button" className="btn-quiet h-10" onClick={() => enter(s.id)}>
                  Open admin <Icon name="chevronRight" size={16} />
                </button>
              </div>
            </div>
          )
        )}
      </section>
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] bg-surface p-3.5">
      <span className="text-2xl">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

function Field(props: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; type?: string; required?: boolean; prefix?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={props.id} className="text-xs font-medium">
        {props.label}
      </label>
      <div className="flex items-center gap-1.5">
        {props.prefix && <span className="shrink-0 text-sm text-muted">{props.prefix}</span>}
        <input
          id={props.id}
          type={props.type ?? "text"}
          className="field h-12 bg-white"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          required={props.required}
          autoComplete="off"
          autoCapitalize="none"
        />
      </div>
      {props.hint && <span className="text-xs text-muted">{props.hint}</span>}
    </div>
  );
}

function AddShop({ onCancel, onAdded }: { onCancel: () => void; onAdded: (list: PlatformShopDto[], name: string) => void }) {
  const [f, setF] = useState({ name: "", slug: "", area: "", owner_name: "", username: "", password: "", barber_name: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [ownerCuts, setOwnerCuts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) =>
    setF((x) => ({ ...x, [k]: v, ...(k === "name" && !slugTouched ? { slug: slugify(v) } : {}) }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onAdded(await api.post<PlatformShopDto[]>("/platform/shops", { ...f, owner_cuts: ownerCuts }), f.name);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-ink bg-surface p-4">
      <span className="text-[15px] font-medium">New shop</span>
      <Field id="n-name" label="Shop name" value={f.name} onChange={set("name")} required />
      <Field
        id="n-slug"
        label="Link"
        prefix="qatarsaloon.com/"
        value={f.slug}
        onChange={(v) => {
          setSlugTouched(true);
          set("slug")(v.toLowerCase());
        }}
        required
      />
      <Field id="n-area" label="Area" value={f.area} onChange={set("area")} hint="e.g. Al Sadd, Doha" />
      <span className="pt-2 text-[13px] font-medium">Owner's login</span>
      <Field id="n-owner" label="Owner's name" value={f.owner_name} onChange={set("owner_name")} required />
      <div className="grid grid-cols-2 gap-2.5">
        <Field id="n-user" label="Username" value={f.username} onChange={(v) => set("username")(v.toLowerCase())} required />
        <Field id="n-pass" label="Temporary password" value={f.password} onChange={set("password")} required />
      </div>
      <Switch id="n-cuts" checked={ownerCuts} onChange={setOwnerCuts} label="The owner is also a barber" hint="Otherwise name the first barber" />
      {!ownerCuts && <Field id="n-barber" label="First barber's name" value={f.barber_name} onChange={set("barber_name")} required />}
      <p className="text-xs leading-relaxed text-muted">
        The shop starts with 10:00–22:00 hours (Friday from 16:00), a haircut and beard service, and the beta plan. The owner can change everything after
        logging in.
      </p>
      {error && <ErrorNote message={error} />}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="h-11 rounded-full bg-ink px-6 text-sm text-cream disabled:opacity-50" disabled={busy}>
          {busy ? "Creating…" : "Create shop"}
        </button>
      </div>
    </form>
  );
}

function EditShop({ s, onCancel, onSaved }: { s: PlatformShopDto; onCancel: () => void; onSaved: (list: PlatformShopDto[], msg: string) => void }) {
  const [f, setF] = useState({ name: s.name, slug: s.slug, area: s.area, plan: s.plan, plan_expires_at: s.plan_expires_at ?? "", notes: s.notes });
  const [active, setActive] = useState(s.active);
  const [newPass, setNewPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.slug !== s.slug && !confirm(`Change the link to qatarsaloon.com/${f.slug}? Links already sent to customers will stop working.`)) return;
    if (s.active && !active && !confirm(`Pause ${s.name}? Customers won't be able to book and the owner can't log in.`)) return;
    setBusy(true);
    setError(null);
    try {
      const list = await api.put<PlatformShopDto[]>(`/platform/shops/${s.id}`, { ...f, active });
      if (newPass) await api.post(`/platform/shops/${s.id}/owner-password`, { password: newPass });
      onSaved(list, newPass ? `Saved. New owner password set.` : "Saved");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-ink bg-surface p-4">
      <Field id={`s-name-${s.id}`} label="Shop name" value={f.name} onChange={set("name")} required />
      <Field id={`s-slug-${s.id}`} label="Link" prefix="qatarsaloon.com/" value={f.slug} onChange={(v) => set("slug")(v.toLowerCase())} required />
      <Field id={`s-area-${s.id}`} label="Area" value={f.area} onChange={set("area")} />
      <Switch id={`s-active-${s.id}`} checked={active} onChange={setActive} label="Active" hint="Paused shops can't take bookings" />
      <div className="grid grid-cols-2 gap-2.5">
        <Field id={`s-plan-${s.id}`} label="Plan" value={f.plan} onChange={set("plan")} hint="e.g. beta, monthly" />
        <Field id={`s-exp-${s.id}`} label="Plan ends" type="date" value={f.plan_expires_at} onChange={set("plan_expires_at")} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`s-notes-${s.id}`} className="text-xs font-medium">
          Private notes
        </label>
        <textarea id={`s-notes-${s.id}`} rows={2} className="resize-none rounded-xl border border-field bg-white px-3.5 py-2.5 text-sm outline-none focus:border-ink" value={f.notes} onChange={(e) => set("notes")(e.target.value)} />
      </div>
      {s.owner && (
        <Field id={`s-pass-${s.id}`} label={`New password for ${s.owner.username} (leave empty to keep)`} value={newPass} onChange={setNewPass} />
      )}
      {error && <ErrorNote message={error} />}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="h-11 rounded-full bg-ink px-6 text-sm text-cream disabled:opacity-50" disabled={busy}>
          Save
        </button>
      </div>
    </form>
  );
}
