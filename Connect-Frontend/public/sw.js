// EduSync Connect service worker — Web Push only. Not a full offline/PWA
// cache worker; its one job is receiving push events and showing a
// notification, which requires a registered, active service worker even
// when the tab (or the whole browser) is closed.

self.addEventListener("push", (event) => {
  let data = { title: "EduSync Connect", body: "You have a new update.", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall back to the defaults above.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/vite.svg",
      badge: "/vite.svg",
      data: { url: data.url },
    })
  );
});

// Clicking the notification focuses an already-open EduSync Connect tab at
// that URL if one exists, otherwise opens a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.pathname === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
