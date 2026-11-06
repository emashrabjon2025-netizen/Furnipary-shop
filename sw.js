// FURNIPART — service worker: bildirishnomalar va oddiy offline zaxira.
const CACHE = "furnipart-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Sahifalar: avval internet, bo'lmasa saqlangan nusxa (admin va API keshlanmaydi)
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin")) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("/")))
  );
});

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch (_) {
    d = { body: e.data && e.data.text() };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || "FURNIPART", {
      body: d.body || "",
      icon: "/img/icon-192.png",
      badge: "/img/badge-96.png",
      tag: d.tag || undefined,
      data: { url: d.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(location.origin) && "focus" in c) {
          c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
