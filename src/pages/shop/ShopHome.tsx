import { Link, useParams } from "react-router";
import type { CSSProperties } from "react";
import { api } from "../../lib/api";
import { useData } from "../../lib/useData";
import type { DayHoursDto, PublicShopDto } from "../../../shared/types";
import { fmtDuration, fmtMin, WEEKDAYS_LONG } from "../../../shared/time";
import { fmtPhone, waLink } from "../../../shared/phone";
import { money } from "../../lib/format";
import { ErrorNote, Spinner } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { useDocumentTitle } from "../../lib/useDocumentTitle";

// Week shown starting Saturday, as is usual in Qatar.
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

function hoursSummary(hours: DayHoursDto[]) {
  const key = (h: DayHoursDto) => (h.closed ? "closed" : `${h.open_min}-${h.close_min}`);
  const rows: { from: number; to: number; text: string }[] = [];
  for (const wd of WEEK_ORDER) {
    const h = hours.find((x) => x.weekday === wd);
    if (!h) continue;
    const text = h.closed ? "Closed" : `${fmtMin(h.open_min)} – ${fmtMin(h.close_min)}`;
    const last = rows.at(-1);
    const lastH = last ? hours.find((x) => x.weekday === last.to) : undefined;
    if (last && lastH && key(lastH) === key(h)) last.to = wd;
    else rows.push({ from: wd, to: wd, text });
  }
  return rows.map((r) => ({
    days: r.from === r.to ? WEEKDAYS_LONG[r.from] : `${WEEKDAYS_LONG[r.from]} – ${WEEKDAYS_LONG[r.to]}`,
    text: r.text,
  }));
}

export function ShopHome() {
  const { slug = "" } = useParams();
  const { data: shop, error, reload } = useData(() => api.get<PublicShopDto>(`/shops/${slug}`), [slug]);
  useDocumentTitle(shop ? `${shop.name} · Book online` : "Book online");

  if (error) return <div className="mx-auto max-w-xl p-5"><ErrorNote message={error} onRetry={reload} /></div>;
  if (!shop) return <Spinner />;

  const today = shop.hours.find((h) => h.weekday === new Date(`${shop.today}T00:00:00Z`).getUTCDay());
  const dailyBreaks = shop.breaks.filter((b) => b.weekday === null);
  const style = { "--accent": shop.accent } as CSSProperties;

  return (
    <div style={style} className="min-h-dvh">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {shop.logo_url && <img src={shop.logo_url} alt="" className="size-9 shrink-0 rounded-full object-cover" />}
            <span className="display truncate text-[22px] font-semibold tracking-wide">{shop.name}</span>
          </div>
          <Link to={`/${slug}/book`} className="flex h-11 items-center rounded-full border border-ink px-5 text-sm font-medium">
            Book
          </Link>
        </header>

        {shop.cover_url ? (
          <img src={shop.cover_url} alt={`${shop.name}`} className="h-[min(460px,60vh)] w-full object-cover" />
        ) : (
          <div className="flex h-[min(460px,55vh)] items-end bg-photo px-5 py-4">
            <span className="text-xs tracking-[0.06em] text-[#5A5146] uppercase">Cover photo</span>
          </div>
        )}

        <section className="flex flex-col gap-4 px-5 pt-10 pb-9">
          {shop.area && <p className="eyebrow tracking-[0.14em]">Barbering · {shop.area}</p>}
          <h1 className="display text-[44px] leading-[1.05]">{shop.tagline || shop.name}</h1>
          {shop.about && <p className="text-base leading-relaxed text-ink-soft">{shop.about}</p>}
          <Link to={`/${slug}/book`} className="btn-primary mt-2 w-full">
            Book an appointment
          </Link>
          {today && (
            <p className="flex items-center gap-2 text-sm text-ink-soft">
              <span className={`size-2 rounded-full ${today.closed ? "bg-bad-ink" : "bg-[#3E7A4A]"}`} />
              {today.closed ? "Closed today" : `Open today · ${fmtMin(today.open_min)} – ${fmtMin(today.close_min)}`}
            </p>
          )}
        </section>

        <section className="border-t border-line px-5 py-8">
          <h2 className="display mb-3 text-[32px]">Services</h2>
          <ul>
            {shop.services.map((s) => (
              <li key={s.id}>
                <Link to={`/${slug}/book?service=${s.id}`} className="flex items-baseline justify-between border-b border-line py-4">
                  <span className="flex flex-col gap-1">
                    <span className="text-[17px]">{s.name}</span>
                    <span className="text-[13px] text-muted">{fmtDuration(s.duration_min)}</span>
                  </span>
                  <span>{money(s.price, shop.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {shop.gallery.length > 0 && (
          <section className="px-5 py-8">
            <h2 className="display mb-4 text-[32px]">Recent work</h2>
            <div className="grid grid-cols-2 gap-2">
              {shop.gallery.map((g) => (
                <img key={g.id} src={g.url} alt={g.caption || "Work by the barber"} loading="lazy" className="aspect-[3/4] w-full object-cover" />
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-4 bg-sand/50 px-5 py-8">
          <h2 className="display text-[32px]">Visit</h2>
          {shop.address && <p className="text-[15px] leading-relaxed">{shop.address}</p>}
          <div className="flex flex-col text-[15px]">
            {hoursSummary(shop.hours).map((r) => (
              <div key={r.days} className="flex justify-between border-b border-line py-2.5">
                <span>{r.days}</span>
                <span>{r.text}</span>
              </div>
            ))}
            {dailyBreaks.map((b) => (
              <div key={b.id} className="flex justify-between border-b border-line py-2.5 text-muted">
                <span>Daily {b.label.toLowerCase() === "break" ? "break" : `break (${b.label})`}</span>
                <span>
                  {fmtMin(b.start_min)} – {fmtMin(b.end_min)}
                </span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {shop.map_url && (
              <a href={shop.map_url} target="_blank" rel="noreferrer" className="btn-outline col-span-2">
                <Icon name="pin" size={18} /> Directions
              </a>
            )}
            {shop.phone && (
              <a href={`tel:${shop.phone}`} className="btn-outline" aria-label={`Call ${fmtPhone(shop.phone)}`}>
                <Icon name="phone" size={18} /> Call
              </a>
            )}
            {shop.whatsapp && (
              <a href={waLink(shop.whatsapp, `Hi ${shop.name}, `)} target="_blank" rel="noreferrer" className="btn-outline">
                <Icon name="whatsapp" size={18} /> WhatsApp
              </a>
            )}
          </div>
        </section>

        <footer className="flex justify-between border-t border-line px-5 py-7 text-xs text-muted">
          <span>© {shop.name}</span>
          <Link to="/admin" className="underline-offset-2 hover:underline">
            Barber login
          </Link>
        </footer>
      </div>
    </div>
  );
}
