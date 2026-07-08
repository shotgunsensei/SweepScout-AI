const baseUrl = new URL(import.meta.env.BASE_URL || "/", window.location.origin);

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export type PwaNotificationPayload = {
  title: string;
  body: string;
  tag: string;
  url?: string;
};

export function assetUrl(path: string) {
  return new URL(path.replace(/^\//, ""), baseUrl).toString();
}

export function hasNotificationSupport() {
  return "Notification" in window && "serviceWorker" in navigator;
}

export async function registerSweepScoutServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported in this browser.");
  }

  return navigator.serviceWorker.register(assetUrl("sw.js"), { scope: import.meta.env.BASE_URL || "/" });
}

export async function ensureNotificationPermission() {
  if (!hasNotificationSupport()) {
    throw new Error("Push notifications are not supported in this browser.");
  }

  const registration = await registerSweepScoutServiceWorker();
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }

  if (Notification.permission !== "granted") {
    throw new Error("Notifications are blocked for SweepScout.");
  }

  return registration;
}

export async function showPwaNotification(payload: PwaNotificationPayload) {
  const registration = await ensureNotificationPermission();
  await registration.showNotification(payload.title, {
    body: payload.body,
    tag: payload.tag,
    icon: assetUrl("favicon.svg"),
    badge: assetUrl("favicon.svg"),
    data: { url: payload.url ?? "/dashboard/mobile" },
  });
}
