import { API_BASE_URL, CONNECT_TOKEN_KEY } from "@/config/api";

// urlBase64ToUint8Array — the Push API's applicationServerKey option wants
// a raw Uint8Array, not the base64url string the backend hands back.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function getAuthHeaders() {
  const token = localStorage.getItem(CONNECT_TOKEN_KEY);
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

// isPushSupported — Safari (desktop < 16, all iOS < 16.4) and some older
// browsers lack the Push API entirely; callers should hide the toggle
// rather than let it silently fail.
export function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function registerServiceWorker() {
  if (!isPushSupported()) return null;
  return navigator.serviceWorker.register("/sw.js");
}

// getCurrentSubscription — null if the service worker isn't registered yet
// or the user never subscribed on this browser/device.
export async function getCurrentSubscription() {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

// subscribeToPush — requests Notification permission (a real permission
// prompt, only fires on a direct user action per browser policy), then
// subscribes this browser/device and registers it with the backend.
// Throws if permission is denied or the platform doesn't support push,
// so the caller (the bell toggle) can show a clear error instead of
// silently doing nothing.
export async function subscribeToPush() {
  if (!isPushSupported()) {
    throw new Error("Push notifications aren't supported in this browser.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const registration = await registerServiceWorker();
  const keyRes = await fetch(`${API_BASE_URL}/connect/push/vapid-public-key`, {
    headers: getAuthHeaders(),
  });
  if (!keyRes.ok) throw new Error("Failed to fetch the push server key.");
  const { publicKey } = await keyRes.json();

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const subJson = subscription.toJSON();
  const res = await fetch(`${API_BASE_URL}/connect/push/subscribe`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
  });
  if (!res.ok) throw new Error("Failed to save your notification subscription.");

  return subscription;
}

// unsubscribeFromPush — removes the browser-level subscription AND tells
// the backend to forget it, so a stale row doesn't linger and get pushed
// to (which would just fail silently server-side, but no reason to leave it).
export async function unsubscribeFromPush() {
  const subscription = await getCurrentSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  await fetch(`${API_BASE_URL}/connect/push/subscribe`, {
    method: "DELETE",
    headers: getAuthHeaders(),
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});
}
