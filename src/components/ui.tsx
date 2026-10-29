import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "./Icon";

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
      <span className="size-6 animate-spin rounded-full border-2 border-line border-t-ink" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl bg-bad-bg px-4 py-3 text-sm text-bad-ink">
      <Icon name="info" size={18} className="mt-px shrink-0" />
      <div className="flex-1">
        {message}
        {onRetry && (
          <button type="button" onClick={onRetry} className="ml-2 underline">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function BackLink({ to, label = "Back" }: { to: string; label?: string }) {
  return (
    <Link to={to} aria-label={label} className="flex size-11 items-center justify-center rounded-full hover:bg-sand">
      <Icon name="back" size={22} />
    </Link>
  );
}

export function Pill({ tone, children }: { tone: "amber" | "ok" | "bad" | "neutral"; children: ReactNode }) {
  const cls = {
    amber: "bg-amber-bg text-amber-ink",
    ok: "bg-ok-bg text-ok-ink",
    bad: "bg-bad-bg text-bad-ink",
    neutral: "bg-sand text-ink-soft",
  }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function StatusPill({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return <Pill tone="amber">Waiting for confirmation</Pill>;
    case "confirmed":
      return <Pill tone="ok">Confirmed</Pill>;
    case "in_progress":
      return <Pill tone="neutral">In the chair</Pill>;
    case "done":
      return <Pill tone="ok">Done</Pill>;
    case "no_show":
      return <Pill tone="bad">No-show</Pill>;
    case "declined":
      return <Pill tone="bad">Declined</Pill>;
    case "cancelled":
      return <Pill tone="bad">Cancelled</Pill>;
    default:
      return <Pill tone="neutral">{status}</Pill>;
  }
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-[15px]">
      <span className="text-muted">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-10 items-center justify-between gap-3">
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  );
}

/** A labelled on/off switch built on a real checkbox. */
export function Switch({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={id} className="flex min-h-12 cursor-pointer items-center justify-between gap-4">
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px]">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-7 w-12 rounded-full bg-field transition-colors peer-checked:bg-[var(--accent,var(--color-olive))] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink" />
        <span className="pointer-events-none absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(id);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div role="status" className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-2xl bg-ink px-4 py-3 text-center text-sm text-cream shadow-lg">
      {message}
    </div>
  );
}
