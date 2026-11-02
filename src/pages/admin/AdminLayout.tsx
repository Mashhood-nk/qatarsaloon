import { createContext, useContext, useState, type CSSProperties } from "react";
import { Navigate, NavLink, Outlet, useNavigate } from "react-router";
import { api, ApiError } from "../../lib/api";
import { useData } from "../../lib/useData";
import type { BarberDto, MeDto } from "../../../shared/types";
import { ErrorNote, Spinner } from "../../components/ui";
import { Icon, type IconName } from "../../components/Icon";
import type { ShopInfo } from "../../lib/messages";

export interface AdminCtx {
  me: MeDto;
  shop: NonNullable<MeDto["shop"]>;
  shopInfo: ShopInfo;
  /** "owner" sees and manages the whole shop; "barber" only their own schedule. */
  role: "owner" | "barber";
  isOwner: boolean;
  /** Active barbers of the shop. */
  barbers: BarberDto[];
  ownBarberId: number | null;
  /** The barber an owner is working with by default (themselves, else the first barber). */
  defaultBarberId: number | null;
  refreshMe: () => void;
}

const Ctx = createContext<AdminCtx | null>(null);

export function useAdmin(): AdminCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdmin outside AdminLayout");
  return v;
}

type NavItem = { to: string; label: string; icon: IconName; end?: boolean };

const OWNER_NAV: NavItem[] = [
  { to: "/admin", label: "Today", icon: "calendar", end: true },
  { to: "/admin/customers", label: "Customers", icon: "user" },
  { to: "/admin/services", label: "Services", icon: "scissors" },
  { to: "/admin/hours", label: "Hours", icon: "clock" },
  { to: "/admin/shop", label: "Shop", icon: "store" },
];

const BARBER_NAV: NavItem[] = [
  { to: "/admin", label: "Today", icon: "calendar", end: true },
  { to: "/admin/customers", label: "Customers", icon: "user" },
  { to: "/admin/hours", label: "My hours", icon: "clock" },
  { to: "/admin/shop", label: "Account", icon: "store" },
];

type MeResult = { kind: "in"; me: MeDto } | { kind: "out" };

export function AdminLayout() {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
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
  if (me.user.role === "platform" && !me.shop) return <Navigate to="/platform" replace />;
  if (!me.shop || !me.shop_role) return <div className="mx-auto max-w-xl p-5"><ErrorNote message="This login isn't linked to a shop yet." /></div>;

  const shop = me.shop;
  const role = me.shop_role;
  const barbers = me.barbers.filter((b) => b.active);
  const value: AdminCtx = {
    me,
    shop,
    shopInfo: { slug: shop.slug, name: shop.name, address: shop.address },
    role,
    isOwner: role === "owner",
    barbers,
    ownBarberId: me.own_barber_id,
    defaultBarberId: me.own_barber_id && barbers.some((b) => b.id === me.own_barber_id) ? me.own_barber_id : (barbers[0]?.id ?? null),
    refreshMe: () => void reload(),
  };
  const style = { "--accent": shop.accent } as CSSProperties;
  const nav = role === "owner" ? OWNER_NAV : BARBER_NAV;

  const backToPlatform = async () => {
    setLeaving(true);
    await api.post("/platform/exit").catch(() => {});
    navigate("/platform");
  };

  return (
    <Ctx.Provider value={value}>
      {me.acting && (
        <div className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-ink px-4 py-2.5 text-sm text-cream">
          <span className="truncate">Viewing {shop.name} as platform admin</span>
          <button type="button" onClick={backToPlatform} disabled={leaving} className="h-9 shrink-0 rounded-full border border-[#6E665B] px-3.5 text-xs">
            Back to platform
          </button>
        </div>
      )}
      <div style={style} className="mx-auto flex min-h-dvh max-w-xl flex-col pb-[calc(76px+env(safe-area-inset-bottom))]">
        <Outlet />
      </div>
      <nav aria-label="Admin" style={style} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className={`mx-auto grid max-w-xl px-1 py-2 ${nav.length === 5 ? "grid-cols-5" : "grid-cols-4"}`}>
          {nav.map((n) => (
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

/** Wraps owner-only pages so barbers see a short note instead. */
export function OwnerOnly({ children }: { children: React.ReactNode }) {
  const { isOwner } = useAdmin();
  if (!isOwner) return <div className="p-5 pt-8"><ErrorNote message="Only the shop owner can change this." /></div>;
  return <>{children}</>;
}

/** Chips to switch between barbers (only shown when there's more than one). */
export function BarberChips({
  value,
  onChange,
  allowAll,
  label = "Barber",
}: {
  value: number | "all";
  onChange: (v: number | "all") => void;
  allowAll?: boolean;
  label?: string;
}) {
  const { barbers } = useAdmin();
  if (barbers.length < 2) return null;
  const opts: { id: number | "all"; name: string }[] = [...(allowAll ? [{ id: "all" as const, name: "All" }] : []), ...barbers];
  return (
    <div className="flex gap-2 overflow-x-auto px-5 py-2 [scrollbar-width:none]" role="radiogroup" aria-label={label}>
      {opts.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={String(o.id)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={`h-10 shrink-0 rounded-full border px-4 text-sm ${on ? "border-[var(--accent)] bg-[var(--accent)] text-cream" : "border-field"}`}
          >
            {o.name}
          </button>
        );
      })}
    </div>
  );
}
