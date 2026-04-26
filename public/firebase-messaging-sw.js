importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAFf7fC9SyyOCVetI1uDUrYwoEuQCSmmTE",
  authDomain: "vocaltranslate-de75d.firebaseapp.com",
  projectId: "vocaltranslate-de75d",
  storageBucket: "vocaltranslate-de75d.firebasestorage.app",
  messagingSenderId: "900785036470",
  appId: "1:900785036470:web:adc8071c3d6bfff3c55a17"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "MyMessenger";
  const body = payload.notification?.body || "Nouveau message";
  self.registration.showNotification(title, {
    body,
    icon: "/icon",
    badge: "/icon",
    tag: "mymessenger-msg",
    renotify: true,
    data: { url: payload.fcmOptions?.link || "/chat" },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/chat"));
});
