// Network-only service worker. It exists so the dashboard can be installed as
// an app; it caches nothing, so task data never sits on the device and the
// numbers are never stale. Offline, the browser shows its usual error page.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
	event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) =>
	event.respondWith(fetch(event.request)),
);
