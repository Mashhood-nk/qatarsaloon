// Shop owner: add barbers, give them their own login, rename or deactivate them.
import { useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { useData } from "../../lib/useData";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import type { TeamMemberDto } from "../../../shared/types";
import { BackLink, ErrorNote, Pill, Spinner, Switch, Toast } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { OwnerOnly, useAdmin } from "./AdminLayout";

export function Team() {
  return (
    <OwnerOnly>
      <TeamInner />
    </OwnerOnly>
  );
}

function TeamInner() {
  useDocumentTitle("Team");
  const { refreshMe, shop } = useAdmin();
  const { data, error, reload, setData } = useData(() => api.get<TeamMemberDto[]>("/admin/team"), []);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  if (error && !data) return <div className="p-5"><ErrorNote message={error} onRetry={reload} /></div>;
  if (!data) return <Spinner />;

  const updated = (list: TeamMemberDto[], msg: string) => {
    setData(list);
    refreshMe();
    setToast(msg);
  };

  return (
    <>
      <header className="flex items-center gap-2 px-3 pt-3">
        <BackLink to="/admin/shop" label="Back to shop" />
        <span className="text-[13px] text-muted">{shop.name}</span>
      </header>
      <div className="flex items-end justify-between px-5 pt-2 pb-2">
        <h1 className="display text-[36px]">Team</h1>
        {!adding && (
          <button type="button" className="flex h-11 items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 text-sm text-cream" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} /> Add barber
          </button>
        )}
      </div>
      <p className="px-5 pb-3 text-sm leading-relaxed text-muted">
        Each barber has their own hours and schedule. With a login, a barber sees only their own day; you see everyone.
      </p>

      {adding && (
        <div className="px-5 pb-3">
          <AddBarber
            onCancel={() => setAdding(false)}
            onAdded={(list, name) => {
              setAdding(false);
              updated(list, `${name} added. Set their hours under Hours.`);
            }}
          />
        </div>
      )}

      <div className="flex flex-col gap-2.5 px-5 pb-8">
        {data.map((m) =>
          editing === m.id ? (
            <EditBarber
              key={m.id}
              m={m}
              onCancel={() => setEditing(null)}
              onSaved={(list, msg) => {
                setEditing(null);
                updated(list, msg);
              }}
            />
          ) : (
            <div key={m.id} className={`card flex items-center gap-3 p-4 ${m.active ? "" : "opacity-60"}`}>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sand text-sm font-medium">
                {m.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2 text-[15px]">
                  {m.name}
                  {m.role === "owner" && <Pill tone="neutral">Owner</Pill>}
                  {!m.active && <Pill tone="bad">Inactive</Pill>}
                </span>
                <span className="truncate text-[13px] text-muted">
                  {m.username ? `Login: ${m.username}` : "No login"}
                  {m.active ? ` · ${m.upcoming} upcoming` : ""}
                </span>
              </span>
              <button type="button" aria-label={`Edit ${m.name}`} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line" onClick={() => setEditing(m.id)}>
                <Icon name="edit" size={16} />
              </button>
            </div>
          )
        )}
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

function AddBarber({ onCancel, onAdded }: { onCancel: () => void; onAdded: (list: TeamMemberDto[], name: string) => void }) {
  const [name, setName] = useState("");
  const [withLogin, setWithLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const list = await api.post<TeamMemberDto[]>("/admin/team", {
        name,
        username: withLogin ? username : "",
        password: withLogin ? password : "",
      });
      onAdded(list, name.trim());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-[var(--accent)] bg-surface p-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="t-name" className="text-xs font-medium">
          Barber's name
        </label>
        <input id="t-name" className="field h-12 bg-white" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus />
      </div>
      <Switch id="t-login" checked={withLogin} onChange={setWithLogin} label="Give them a login" hint="They'll see only their own schedule" />
      {withLogin && (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="t-user" className="text-xs font-medium">
              Username
            </label>
            <input id="t-user" className="field h-12 bg-white" autoCapitalize="none" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} maxLength={30} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="t-pass" className="text-xs font-medium">
              Password (8+)
            </label>
            <input id="t-pass" type="text" className="field h-12 bg-white" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </div>
        </div>
      )}
      {withLogin && <p className="text-xs text-muted">Share the username and password with them. They can change the password after logging in.</p>}
      {error && <ErrorNote message={error} />}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="h-11 rounded-full bg-ink px-6 text-sm text-cream disabled:opacity-50" disabled={busy}>
          {busy ? "Adding…" : "Add barber"}
        </button>
      </div>
    </form>
  );
}

function EditBarber({ m, onCancel, onSaved }: { m: TeamMemberDto; onCancel: () => void; onSaved: (list: TeamMemberDto[], msg: string) => void }) {
  const [name, setName] = useState(m.name);
  const [active, setActive] = useState(m.active);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let list = await api.put<TeamMemberDto[]>(`/admin/team/${m.id}`, { name, active });
      if (password) list = await api.post<TeamMemberDto[]>(`/admin/team/${m.id}/login`, { username, password });
      const msg = password ? (m.username ? `New password set for ${name}` : `Login created for ${name}`) : !active && m.active ? `${name} deactivated` : "Saved";
      onSaved(list, msg);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-[var(--accent)] bg-surface p-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`e-name-${m.id}`} className="text-xs font-medium">
          Name
        </label>
        <input id={`e-name-${m.id}`} className="field h-12 bg-white" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
      </div>
      {m.role !== "owner" && (
        <>
          <Switch id={`e-active-${m.id}`} checked={active} onChange={setActive} label="Active" hint="Inactive barbers can't be booked or log in" />
          {m.username ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`e-pass-${m.id}`} className="text-xs font-medium">
                New password for {m.username} (leave empty to keep)
              </label>
              <input id={`e-pass-${m.id}`} type="text" autoComplete="off" className="field h-12 bg-white" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`e-user-${m.id}`} className="text-xs font-medium">
                  New login: username
                </label>
                <input id={`e-user-${m.id}`} className="field h-12 bg-white" autoCapitalize="none" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`e-pass-${m.id}`} className="text-xs font-medium">
                  Password (8+)
                </label>
                <input id={`e-pass-${m.id}`} type="text" autoComplete="off" className="field h-12 bg-white" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
          )}
        </>
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
