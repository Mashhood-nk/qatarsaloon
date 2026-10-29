import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../../lib/api";
import { useData } from "../../lib/useData";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import type { CustomerDto } from "../../../shared/types";
import { fmtPhone } from "../../../shared/phone";
import { fmtDateShort } from "../../../shared/time";
import { ErrorNote, Spinner } from "../../components/ui";
import { Icon } from "../../components/Icon";

type Item = CustomerDto & { visits: number; last_visit: string | null };

export function Customers() {
  useDocumentTitle("Customers");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setQuery(q), 250);
    return () => window.clearTimeout(id);
  }, [q]);
  const { data, error, loading, reload } = useData(() => api.get<Item[]>(`/admin/customers?q=${encodeURIComponent(query)}`), [query]);

  return (
    <>
      <header className="px-5 pt-6 pb-3">
        <h1 className="display text-[36px]">Customers</h1>
      </header>
      <div className="px-5">
        <label className="relative block">
          <span className="sr-only">Search customers</span>
          <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
          <input type="search" className="field pl-10" placeholder="Search by name or number" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-col px-5 pt-3 pb-6">
        {error && <ErrorNote message={error} onRetry={reload} />}
        {loading && !data && <Spinner />}
        {data && data.length === 0 && <p className="py-6 text-[15px] text-muted">{query ? "No customers match." : "Customers appear here after their first booking."}</p>}
        {data?.map((c) => (
          <Link key={c.id} to={`/admin/customers/${c.id}`} className="flex items-center gap-3.5 border-b border-line py-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sand text-sm font-medium">
              {(c.name || "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-base">{c.name || "No name"}</span>
              <span className="truncate text-[13px] text-muted">{fmtPhone(c.phone)}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted">
              <span>
                {c.visits} visit{c.visits === 1 ? "" : "s"}
              </span>
              {c.last_visit && <span>Last {fmtDateShort(c.last_visit)}</span>}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
