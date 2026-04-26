import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

export async function POST(req: NextRequest) {
  const { token, title, body } = await req.json();
  if (!token) return NextResponse.json({ error: "No token" }, { status: 400 });

  try {
    getAdminApp();
    await getMessaging().send({
      token,
      notification: { title, body },
      webpush: {
        notification: {
          icon: "https://mymessenger-mu.vercel.app/icon",
          tag: "mymessenger-msg",
          renotify: true,
        },
        fcmOptions: { link: "https://mymessenger-mu.vercel.app/chat" },
      },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
