import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { doc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { app } from "./firebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY!;

export async function initFCM(userId: string) {
  if (typeof window === "undefined") return;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) {
      await setDoc(doc(db, "users", userId), { fcmToken: token }, { merge: true });
    }
    return messaging;
  } catch (e) {
    console.error("FCM init error:", e);
  }
}

export async function onForegroundMessage(callback: (payload: any) => void) {
  if (typeof window === "undefined") return;
  const messaging = getMessaging(app);
  return onMessage(messaging, callback);
}
