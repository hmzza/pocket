self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "New Pocket delivery order", body: "A customer delivery order needs acceptance." };
  }

  if (payload.type === "delivery-resolved") {
    event.waitUntil(
      self.registration.getNotifications({ tag: `pocket-delivery-${payload.orderId}` }).then((notifications) => {
        notifications.forEach((notification) => notification.close());
      })
    );
    return;
  }

  const title = payload.title || "New Pocket delivery order";
  const options = {
    body: payload.body || "A customer delivery order needs acceptance.",
    icon: "/icon.png",
    badge: "/icon.png",
    tag: `pocket-delivery-${payload.orderId || "new"}`,
    renotify: true,
    requireInteraction: true,
    data: { url: payload.url || "/admin/delivery" }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/admin/delivery", self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url.startsWith(self.location.origin));
      if (existing) return existing.focus().then(() => existing.navigate(targetUrl));
      return clients.openWindow(targetUrl);
    })
  );
});
