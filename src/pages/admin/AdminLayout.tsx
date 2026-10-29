import { createContext, useContext, type CSSProperties } from "react";
import { Navigate, NavLink, Outlet } from "react-router";
import { api, ApiError } from "../../lib/api";
import { useData } from "../../lib/useData";
import type { MeDto } from "../../../shared/types";
import { ErrorNote, Spinner } from "../../components/ui";
import { Icon, type IconName } from "../../components/Icon";
import type { ShopInfo } from "../../lib/messages";

export interface AdminCtx {
  me: MeDto;
  shop: NonNullable<MeDto["shop"]>;
  shopInfo: ShopInfo;
  refreshMe: () => void;
}

const Ctx = createContext<AdminCtx | null>(null);

export function useAdmin(): AdminCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdmin outside AdminLayout");
  return v;
}

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "/admin", label: "Today", icon: "calendar", end: true },
  { to: "/admin/customers", label: "Customers", icon: "user" },
  { to: "/admin/services", label: "Services", icon: "scissors" },
  { to: "/admin/hours", label: "Hours", icon: "clock" },
  { to: "/admin/shop", label: "Shop", icon: "store" },
];

type MeResult = { kind: "in"; me: MeDto } | { kind: "out" };

export function AdminLayout() {
  const { data, error, loading, reload } = useData<MeResult>(async () => {
    try {
      return { kind: "in", me: await api.get<MeDto>("/auth/me") };
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return { kind: "out" };
      throw e;
    }
  }, []);

  if (loading && !data) return <Spinner />;
  if (error && !data) return <div className="mx-auto max-w-xl p-5"><ErrorNote message={error} onRetry={reload} /></div>;
  if (!data || data.kind === "out") return <Navigate to="/admin/login" replace />;
  const { me } = data;
  if (!me.shop) return <div className="mx-auto max-w-xl p-5"><ErrorNote message="This login isn't linked to a shop yet." /></div>;

  const shop = me.shop;
  const value: AdminCtx = {
    me,
    shop,
    shopInfo: { slug: shop.slug, name: shop.name, address: shop.address },
    refreshMe: () => void reload(),
  };
  const style = { "--accent": shop.accent } as CSSProperties;

  return (
    <Ctx.Provider value={value}>
      <div style={style} className="mx-auto flex min-h-dvh max-w-xl flex-col pb-[calc(76px+env(safe-area-inset-bottom))]">
        <Outlet />
      </div>
      <nav aria-label="Admin" style={style} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-xl grid-cols-5 px-1 py-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-1.5 text-[11px] ${isActive ? "font-semibold text-[var(--accent)]" : "text-muted"}`
              }
            >
              <Icon name={n.icon} size={22} />
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </Ctx.Provider>
  );
}
