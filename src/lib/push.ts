// Turning push notifications on/off for this device.
import { api } from "./api";

export type PushStatus =
  | "unsupported" // this browser can't do web push
  | "ios-install" // iPhone/iPad: must be opened from the home-screen icon first
  | "denied" // the person blocked notifications for this site
  | "off"
  | "on";

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export async function pushStatus(): Promise<PushStatus> {
  if (isIOS() && !isStandalone()) return "ios-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub && Notification.permission === "granted") {
    // Make sure the server knows this device (e.g. after logging in as someone else).
    api.post("/admin/push/subscribe", sub.toJSON()).catch(() => {});
    return "on";
  }
  return "off";
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Must be called from a tap (browsers only allow the permission prompt then). */
export async function turnOnPush(): Promise<PushStatus> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
  await navigator.serviceWorker.ready;
  const { public_key } = await api.get<{ public_key: string }>("/admin/push/key");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(public_key) });
  await api.post("/admin/push/subscribe", sub.toJSON());
  return "on";
}

export async function turnOffPush(): Promise<PushStatus> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.post("/admin/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
  return "off";
}

export const sendTestPush = () => api.post<{ devices: number }>("/admin/push/test");
