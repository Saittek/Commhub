self.addEventListener("push", (event) => {
  let title = "Commhub";
  let body = "You have a new notification.";
  try {
    const data = event.data?.json();
    if (data?.title) title = data.title;
    if (data?.body) body = data.body;
  } catch {
    // Use defaults.
  }
  event.waitUntil(self.registration.showNotification(title, { body }));
});
