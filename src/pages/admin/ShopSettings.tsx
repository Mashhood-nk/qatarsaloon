import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api, errorMessage } from "../../lib/api";
import { useData } from "../../lib/useData";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { resizeImage } from "../../lib/image";
import type { AdminShopDto } from "../../../shared/types";
import { splitE164, toE164 } from "../../../shared/phone";
import { ErrorNote, SectionTitle, Spinner, Toast } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { PhoneField, type PhoneValue } from "../../components/PhoneField";
import { useAdmin } from "./AdminLayout";

const SWATCHES = ["#3F4A2E", "#5B3A29", "#24211C", "#2E4552", "#6B2D3C", "#7A5C2E"];

const toValue = (e164: string): PhoneValue => {
  if (!e164) return { dial: "974", local: "" };
  const s = splitE164(e164);
  return { dial: s.dial || "974", local: s.local };
};

export function ShopSettings() {
  useDocumentTitle("Shop");
  const { refreshMe, me } = useAdmin();
  const navigate = useNavigate();
  const { data, error, reload, setData } = useData(() => api.get<AdminShopDto>("/admin/shop"), []);
  const [toast, setToast] = useState<string | null>(null);

  if (error && !data) return <div className="p-5"><ErrorNote message={error} onRetry={reload} /></div>;
  if (!data) return <Spinner />;

  const bookingUrl = `${window.location.origin}/${data.slug}`;

  const logout = async () => {
    await api.post("/auth/logout").catch(() => {});
    navigate("/admin/login", { replace: true });
  };

  return (
    <>
      <header className="px-5 pt-6 pb-2">
        <h1 className="display text-[36px]">Your shop</h1>
      </header>

      <section className="px-5 pt-2">
        <div className="card flex flex-col gap-3 p-4">
          <span className="text-sm text-ink-soft">Your booking page</span>
          <a href={bookingUrl} target="_blank" rel="noreferrer" className="text-[15px] break-all text-[var(--accent)] underline">
            {bookingUrl}
          </a>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn-quiet"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(bookingUrl);
                  setToast("Link copied");
                } catch {
                  setToast("Couldn't copy. Press and hold the link instead.");
                }
              }}
            >
              <Icon name="link" size={16} /> Copy link
            </button>
            {"share" in navigator ? (
              <button type="button" className="btn-quiet" onClick={() => navigator.share({ title: data.name, url: bookingUrl }).catch(() => {})}>
                Share
              </button>
            ) : (
              <a href={bookingUrl} target="_blank" rel="noreferrer" className="btn-quiet">
                Open
              </a>
            )}
          </div>
        </div>
      </section>

      <Photos shop={data} onChange={(s) => { setData(s); setToast("Photo saved"); }} onError={setToast} />
      <Details shop={data} onSaved={(s) => { setData(s); refreshMe(); setToast("Saved"); }} />
      <Password onDone={() => setToast("Password changed")} />

      <section className="px-5 pt-6 pb-8">
        <button type="button" className="btn-outline w-full" onClick={logout}>
          <Icon name="logout" size={18} /> Log out ({me.user.username})
        </button>
      </section>
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

function Photos({ shop, onChange, onError }: { shop: AdminShopDto; onChange: (s: AdminShopDto) => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const inputs = { cover: useRef<HTMLInputElement>(null), logo: useRef<HTMLInputElement>(null), gallery: useRef<HTMLInputElement>(null) };

  const upload = async (kind: "cover" | "logo" | "gallery", files: FileList | null) => {
    if (!files?.length) return;
    setBusy(kind);
    try {
      let latest = shop;
      for (const file of Array.from(files).slice(0, kind === "gallery" ? 10 : 1)) {
        const blob = await resizeImage(file, kind === "logo" ? 512 : 1600);
        latest = await api.upload<AdminShopDto>(`/admin/images?kind=${kind}`, blob);
      }
      onChange(latest);
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(null);
      const el = inputs[kind].current;
      if (el) el.value = "";
    }
  };

  const removeGallery = async (id: number) => {
    if (!confirm("Remove this photo?")) return;
    try {
      onChange(await api.del<AdminShopDto>(`/admin/gallery/${id}`));
    } catch (e) {
      onError(errorMessage(e));
    }
  };

  const removeImage = async (kind: "cover" | "logo") => {
    if (!confirm(`Remove the ${kind}?`)) return;
    try {
      onChange(await api.del<AdminShopDto>(`/admin/images/${kind}`));
    } catch (e) {
      onError(errorMessage(e));
    }
  };

  const fileInput = (kind: "cover" | "logo" | "gallery") => (
    <input ref={inputs[kind]} type="file" accept="image/*" multiple={kind === "gallery"} className="sr-only" onChange={(e) => upload(kind, e.target.files)} />
  );

  return (
    <section className="px-5 pt-7">
      <SectionTitle>Photos</SectionTitle>
      <div className="flex flex-col gap-3">
        <div className="card overflow-hidden">
          {shop.cover_url ? (
            <img src={shop.cover_url} alt="Cover" className="h-44 w-full object-cover" />
          ) : (
            <div className="flex h-44 items-center justify-center bg-photo text-sm text-[#4F473C]">No cover photo yet</div>
          )}
          <div className="flex items-center justify-between gap-2 p-3">
            <span className="text-[15px]">Cover photo</span>
            <div className="flex gap-2">
              {shop.cover_url && (
                <button type="button" className="btn-quiet h-10" onClick={() => removeImage("cover")}>
                  Remove
                </button>
              )}
              <label className="btn-quiet h-10 cursor-pointer">
                {busy === "cover" ? "Uploading…" : shop.cover_url ? "Change" : "Upload"}
                {fileInput("cover")}
              </label>
            </div>
          </div>
        </div>

        <div className="card flex items-center gap-3 p-3">
          {shop.logo_url ? (
            <img src={shop.logo_url} alt="Logo" className="size-14 rounded-full object-cover" />
          ) : (
            <span className="flex size-14 items-center justify-center rounded-full bg-photo">
              <Icon name="image" />
            </span>
          )}
          <span className="flex-1 text-[15px]">Logo</span>
          {shop.logo_url && (
            <button type="button" className="btn-quiet h-10" onClick={() => removeImage("logo")}>
              Remove
            </button>
          )}
          <label className="btn-quiet h-10 cursor-pointer">
            {busy === "logo" ? "Uploading…" : shop.logo_url ? "Change" : "Upload"}
            {fileInput("logo")}
          </label>
        </div>

        <div className="card p-3">
          <div className="flex items-center justify-between pb-3">
            <span className="text-[15px]">Gallery ({shop.gallery.length}/30)</span>
            <label className="btn-quiet h-10 cursor-pointer">
              <Icon name="plus" size={16} /> {busy === "gallery" ? "Uploading…" : "Add photos"}
              {fileInput("gallery")}
            </label>
          </div>
          {shop.gallery.length === 0 ? (
            <p className="text-sm text-muted">Show off your work. Photos appear on your booking page under "Recent work".</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {shop.gallery.map((g) => (
                <div key={g.id} className="relative">
                  <img src={g.url} alt="" className="aspect-square w-full object-cover" />
                  <button type="button" aria-label="Remove photo" onClick={() => removeGallery(g.id)} className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-ink/70 text-cream">
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Details({ shop, onSaved }: { shop: AdminShopDto; onSaved: (s: AdminShopDto) => void }) {
  const [f, setF] = useState({
    name: shop.name,
    tagline: shop.tagline,
    about: shop.about,
    area: shop.area,
    address: shop.address,
    map_url: shop.map_url,
    accent: shop.accent,
  });
  const [phone, setPhone] = useState<PhoneValue>(toValue(shop.phone));
  const [wa, setWa] = useState<PhoneValue>(toValue(shop.whatsapp));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const field = (key: keyof typeof f, label: string, opts: { max?: number; textarea?: boolean; placeholder?: string } = {}) => (
    <div className="flex flex-col gap-2">
      <label htmlFor={`sh-${key}`} className="label">
        {label}
      </label>
      {opts.textarea ? (
        <textarea id={`sh-${key}`} rows={3} maxLength={opts.max} placeholder={opts.placeholder} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} className="resize-none rounded-xl border border-field bg-surface px-3.5 py-3 text-[15px] leading-relaxed outline-none focus:border-ink" />
      ) : (
        <input id={`sh-${key}`} className="field" maxLength={opts.max} placeholder={opts.placeholder} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
      )}
    </div>
  );

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const phoneE = phone.local.trim() ? toE164(phone.dial, phone.local) : "";
    const waE = wa.local.trim() ? toE164(wa.dial, wa.local) : "";
    if (phoneE === null) return setError("Check the shop phone number");
    if (waE === null) return setError("Check the shop WhatsApp number");
    setBusy(true);
    try {
      onSaved(await api.put<AdminShopDto>("/admin/shop", { ...f, phone: phoneE, whatsapp: waE }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-4 px-5 pt-7">
      <SectionTitle>Details on your page</SectionTitle>
      {field("name", "Shop name", { max: 80 })}
      {field("tagline", "Headline", { max: 120, placeholder: "Precise cuts. Unhurried service." })}
      {field("about", "Short intro", { max: 600, textarea: true })}
      {field("area", "Area", { max: 60, placeholder: "e.g. Al Sadd, Doha" })}
      {field("address", "Address", { max: 200 })}
      {field("map_url", "Google Maps link", { max: 500, placeholder: "https://maps.app.goo.gl/…" })}
      <PhoneField id="sh-phone" label="Shop phone (for the Call button)" value={phone} onChange={setPhone} />
      <PhoneField id="sh-wa" label="Shop WhatsApp" value={wa} onChange={setWa} />
      <div className="flex flex-col gap-2">
        <span className="label">Accent colour</span>
        <div className="flex flex-wrap items-center gap-2.5">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={f.accent.toLowerCase() === c.toLowerCase()}
              onClick={() => setF({ ...f, accent: c })}
              className={`size-11 rounded-full border-2 ${f.accent.toLowerCase() === c.toLowerCase() ? "border-ink" : "border-transparent"}`}
              style={{ background: c }}
            />
          ))}
          <label className="flex h-11 items-center gap-2 rounded-full border border-field px-3 text-sm">
            <input type="color" value={f.accent} onChange={(e) => setF({ ...f, accent: e.target.value })} className="size-7 cursor-pointer border-0 bg-transparent p-0" aria-label="Custom colour" />
            Custom
          </label>
        </div>
      </div>
      {error && <ErrorNote message={error} />}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? "Saving…" : "Save details"}
      </button>
    </form>
  );
}

function Password({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/password", { current, next });
      setOpen(false);
      setCurrent("");
      setNext("");
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="px-5 pt-7">
      <SectionTitle>Login</SectionTitle>
      {!open ? (
        <button type="button" className="btn-quiet" onClick={() => setOpen(true)}>
          Change password
        </button>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-3">
          <input type="password" autoComplete="current-password" className="field" placeholder="Current password" aria-label="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          <input type="password" autoComplete="new-password" className="field" placeholder="New password (8+ characters)" aria-label="New password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
          {error && <ErrorNote message={error} />}
          <div className="flex gap-2">
            <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="h-11 rounded-full bg-ink px-6 text-sm text-cream disabled:opacity-50" disabled={busy}>
              Save password
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
