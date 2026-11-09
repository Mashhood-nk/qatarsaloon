import { useEffect, useState } from "react";
import { errorMessage } from "../lib/api";
import { pushStatus, sendTestPush, turnOffPush, turnOnPush, type PushStatus } from "../lib/push";
import { Icon } from "./Icon";

/** Notifications on/off for this device, with clear guidance for iPhone and blocked permission. */
export function PushCard({ onMessage }: { onMessage: (m: string) => void }) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushStatus()
      .then(setStatus)
      .catch(() => setStatus("unsupported"));
  }, []);

  const run = async (fn: () => Promise<PushStatus>, ok?: string) => {
    setBusy(true);
    try {
      const s = await fn();
      setStatus(s);
      if (s === "on" && ok) onMessage(ok);
      if (s === "denied") onMessage("Notifications are blocked for this site. See the steps below.");
    } catch (e) {
      onMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      await sendTestPush();
      onMessage("Test sent. It should arrive in a few seconds.");
    } catch (e) {
      onMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (status === null) return null;

  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${status === "on" ? "bg-ok-bg text-ok-ink" : "bg-sand"}`}>
          <Icon name={status === "on" ? "check" : "info"} />
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-[15px] font-medium">
            {status === "on" ? "Notifications are on" : "Notifications on this phone"}
          </span>
          <span className="text-[13px] leading-relaxed text-muted">
            {status === "on"
              ? "This device gets new bookings, cancellations and reminder nudges."
              : "Get an alert for new bookings, cancellations, and when it's time to send a reminder."}
          </span>
        </div>
      </div>

      {status === "off" && (
        <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => run(turnOnPush, "Notifications turned on")}>
          Turn on notifications
        </button>
      )}

      {status === "on" && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-quiet" disabled={busy} onClick={test}>
            Send a test
          </button>
          <button type="button" className="btn-quiet" disabled={busy} onClick={() => run(turnOffPush)}>
            Turn off
          </button>
        </div>
      )}

      {status === "ios-install" && (
        <ol className="flex list-decimal flex-col gap-1.5 rounded-xl bg-sand px-4 py-3 pl-8 text-[13px] leading-relaxed">
          <li>
            Open this page in <b>Safari</b>.
          </li>
          <li>
            Tap the <b>Share</b> button, then <b>Add to Home Screen</b>.
          </li>
          <li>Open Qatar Saloon from the new icon and log in.</li>
          <li>
            Come back here and tap <b>Turn on notifications</b>.
          </li>
        </ol>
      )}
      {status === "ios-install" && <p className="text-xs text-muted">Needs iOS 16.4 or newer.</p>}

      {status === "denied" && (
        <p className="rounded-xl bg-amber-bg px-4 py-3 text-[13px] leading-relaxed text-amber-ink">
          Notifications are blocked. On iPhone: Settings → Notifications → Qatar Saloon → Allow. On Android or a computer: tap the lock icon next
          to the address → Notifications → Allow. Then reload this page.
        </p>
      )}

      {status === "unsupported" && (
        <p className="text-[13px] leading-relaxed text-muted">This browser can't receive notifications. Try Chrome on Android, or Safari on iPhone.</p>
      )}
    </div>
  );
}
