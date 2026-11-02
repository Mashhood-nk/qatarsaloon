// qatarsaloon.com home: customers pick a barbershop to book with.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { api } from "../lib/api";
import { useData } from "../lib/useData";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import type { DirectoryShopDto } from "../../shared/types";
import { money } from "../lib/format";
import { ErrorNote, Spinner } from "../components/ui";
import { Icon } from "../components/Icon";

export function Directory() {
  useDocumentTitle("Qatar Saloon · Book a barber in Qatar");
  const { data, error, reload } = useData(() => api.get<DirectoryShopDto[]>("/shops"), []);
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!data || !term) return data ?? [];
    return data.filter((s) => `${s.name} ${s.area}`.toLowerCase().includes(term));
  }, [data, q]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="flex items-center justify-between border-b border-line px-5 py-4">
        <span className="display text-[22px] font-semibold tracking-wide">Qatar Saloon</span>
        <span className="text-[13px] text-muted">Online booking</span>
      </header>

      <section className="flex flex-col gap-4 px-5 pt-12 pb-8">
        <p className="eyebrow tracking-[0.14em]">Barbershops in Qatar</p>
        <h1 className="display text-[44px] leading-[1.05]">
          Book your next cut
          <br />
          in under a minute.
        </h1>
        <p className="text-base leading-relaxed text-ink-soft">
          Pick a barbershop, choose your services and a time that suits you. The shop confirms on WhatsApp. No app, no sign-up.
        </p>
      </section>

      {data && data.length > 4 && (
        <div className="px-5 pb-4">
          <label className="relative block">
            <span className="sr-only">Search barbershops</span>
            <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
            <input type="search" className="field pl-10" placeholder="Search by name or area" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
      )}

      <section className="flex flex-col gap-4 px-5 pb-12">
        {error && <ErrorNote message={error} onRetry={reload} />}
        {!data && !error && <Spinner label="Loading barbershops" />}
        {data && data.length === 0 && <p className="py-6 text-[15px] text-muted">No barbershops are taking online bookings yet. Check back soon.</p>}
        {data && data.length > 0 && shown.length === 0 && <p className="py-6 text-[15px] text-muted">No barbershops match “{q}”.</p>}
        {shown.map((s) => (
          <Link
            key={s.slug}
            to={`/${s.slug}`}
            className="group overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-[var(--c)]"
            style={{ ["--c" as string]: s.accent }}
          >
            {s.cover_url ? (
              <img src={s.cover_url} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />
            ) : (
              <div className="flex aspect-[16/9] w-full items-center justify-center" style={{ background: s.accent }}>
                <span className="display px-6 text-center text-3xl text-cream">{s.name}</span>
              </div>
            )}
            <div className="flex items-center gap-3.5 p-4">
              {s.logo_url && <img src={s.logo_url} alt="" className="size-11 shrink-0 rounded-full object-cover" />}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="display truncate text-[24px] leading-tight">{s.name}</span>
                <span className="truncate text-[13px] text-muted">
                  {[s.area, s.barbers > 1 ? `${s.barbers} barbers` : null, s.from_price !== null ? `from ${money(s.from_price, s.currency)}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <span
                className="flex h-11 shrink-0 items-center rounded-full px-4 text-sm font-medium text-cream"
                style={{ background: s.accent }}
              >
                Book
              </span>
            </div>
          </Link>
        ))}
      </section>

      <footer className="mt-auto flex justify-between border-t border-line px-5 py-7 text-xs text-muted">
        <span>© Qatar Saloon</span>
        <Link to="/admin/login" className="underline-offset-2 hover:underline">
          Barber login
        </Link>
      </footer>
    </div>
  );
}
