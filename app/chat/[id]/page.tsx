"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, onSnapshot, orderBy, query, serverTimestamp, doc, getDoc, updateDoc } from "firebase/firestore";
import { LANGUAGES, speakText, transcribeAudio } from "@/lib/speech";
import { translateText } from "@/lib/translate";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { playNotificationSound, requestNotificationPermission, showBrowserNotification } from "@/lib/notify";
import { initFCM } from "@/lib/fcm-client";

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  originalText: string;
  translatedText: string;
  originalLang: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  createdAt: any;
}

export default function ConversationPage() {
  const { id } = useParams();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [myLang, setMyLang] = useState("fr");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [otherName, setOtherName] = useState("Contact");
  const [otherLang, setOtherLang] = useState("zh");
  const [otherPhoto, setOtherPhoto] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const prevMessageCountRef = useRef(0);
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/"); return; }
      setUser(u);
      initFCM(u.uid);
      const userDoc = await getDoc(doc(db, "users", u.uid));
      if (userDoc.exists()) setMyLang(userDoc.data().language || "fr");

      const convDoc = await getDoc(doc(db, "conversations", id as string));
      if (!convDoc.exists()) { router.push("/chat"); return; }
      const data = convDoc.data();
      const otherId = data.participants.find((p: string) => p !== u.uid);
      setOtherName(data.participantNames?.[otherId] || "Contact");
      if (otherId) {
        const otherUserDoc = await getDoc(doc(db, "users", otherId));
        if (otherUserDoc.exists()) {
          setOtherLang(otherUserDoc.data().language || "zh");
          setOtherPhoto(otherUserDoc.data().photoURL);
        }
      }
    });
  }, [id, router]);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, "conversations", id as string, "messages"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snap) => {
      const newMessages = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      setMessages(newMessages);

      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
        prevMessageCountRef.current = newMessages.length;
        return;
      }

      if (newMessages.length > prevMessageCountRef.current) {
        const latest = newMessages[newMessages.length - 1];
        // Ne joue le son que si c'est un message de l'autre personne
        if (latest.senderId !== auth.currentUser?.uid) {
          playNotificationSound();
          showBrowserNotification(
            latest.senderName || "Nouveau message",
            latest.translatedText || latest.originalText || (latest.mediaType === "video" ? "📹 Vidéo" : "📷 Photo")
          );
        }
      }
      prevMessageCountRef.current = newMessages.length;
    });
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(originalText: string, mediaUrl?: string, mediaType?: "image" | "video") {
    if (!originalText.trim() && !mediaUrl) return;
    if (!user) return;
    setSending(true);
    try {
      const translated = originalText.trim() ? await translateText(originalText, myLang, otherLang) : "";
      await addDoc(collection(db, "conversations", id as string, "messages"), {
        senderId: user.uid,
        senderName: user.displayName || user.email,
        originalText: originalText || "",
        translatedText: translated,
        originalLang: myLang,
        ...(mediaUrl && { mediaUrl, mediaType }),
        createdAt: serverTimestamp(),
      });
      const lastMsg = mediaUrl ? (mediaType === "video" ? "📹 Vidéo" : "📷 Photo") : translated;
      await updateDoc(doc(db, "conversations", id as string), {
        lastMessage: lastMsg,
        updatedAt: serverTimestamp(),
      });

      // Envoie notification push au destinataire
      const convDoc = await getDoc(doc(db, "conversations", id as string));
      if (convDoc.exists()) {
        const otherId = convDoc.data().participants.find((p: string) => p !== user.uid);
        if (otherId) {
          const otherDoc = await getDoc(doc(db, "users", otherId));
          const fcmToken = otherDoc.data()?.fcmToken;
          if (fcmToken) {
            fetch("/api/notify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token: fcmToken,
                title: user.displayName || user.email || "MyMessenger",
                body: lastMsg || "Nouveau message",
              }),
            });
          }
        }
      }
    } catch (e) { console.error(e); }
    setSending(false);
    setText("");
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url, type } = await uploadToCloudinary(file);
      await sendMessage("", url, type);
    } catch (err) {
      alert("Erreur lors de l'envoi du fichier.");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function toggleRecording() {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
    } else {
      const myLangObj = LANGUAGES.find(l => l.code === myLang);
      if (!myLangObj) return;
      setRecording(true);
      recognitionRef.current = transcribeAudio(
        myLangObj.speechCode,
        (transcript) => { sendMessage(transcript); setRecording(false); },
        () => setRecording(false)
      );
      if (!recognitionRef.current) {
        alert("La reconnaissance vocale n'est pas supportée sur ce navigateur. Utilisez Safari ou Chrome.");
        setRecording(false);
      }
    }
  }

  function playMessage(msg: Message) {
    const isMe = msg.senderId === user?.uid;
    const langCode = isMe ? otherLang : myLang;
    const langObj = LANGUAGES.find(l => l.code === langCode);
    if (langObj && msg.translatedText) speakText(msg.translatedText, langObj.speechCode);
  }

  const myLangLabel = LANGUAGES.find(l => l.code === myLang)?.label || myLang;
  const otherLangLabel = LANGUAGES.find(l => l.code === otherLang)?.label || otherLang;

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: "#e5ddd5", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: "#128C7E", color: "white", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 10 }}>
        <button onClick={() => router.push("/chat")} style={{ background: "none", border: "none", color: "white", fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>
        {otherPhoto ? (
          <img src={otherPhoto} alt={otherName} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16 }}>
            {otherName[0]?.toUpperCase()}
          </div>
        )}
        <div>
          <div style={{ fontWeight: 700 }}>{otherName}</div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>Vous: {myLangLabel} → Lui: {otherLangLabel}</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#666" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎤</div>
            <p style={{ fontSize: 14 }}>Appuyez sur le micro pour envoyer un message vocal.<br />Il sera automatiquement traduit.</p>
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.senderId === user?.uid;
          return (
            <div key={msg.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "75%", background: isMe ? "#DCF8C6" : "white", borderRadius: isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px", padding: "10px 14px", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
                {!isMe && <div style={{ fontSize: 12, fontWeight: 600, color: "#128C7E", marginBottom: 4 }}>{msg.senderName}</div>}

                {/* Media */}
                {msg.mediaUrl && msg.mediaType === "image" && (
                  <img src={msg.mediaUrl} alt="photo" style={{ width: "100%", borderRadius: 8, marginBottom: 6, display: "block" }} />
                )}
                {msg.mediaUrl && msg.mediaType === "video" && (
                  <video src={msg.mediaUrl} controls style={{ width: "100%", borderRadius: 8, marginBottom: 6, display: "block" }} />
                )}

                {/* Text */}
                {msg.originalText && (
                  <>
                    <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>
                      {isMe ? `Vous (${myLangLabel})` : `Original (${LANGUAGES.find(l => l.code === msg.originalLang)?.label || msg.originalLang})`}
                    </div>
                    <div style={{ fontSize: 14, color: "#555", fontStyle: "italic", marginBottom: 6 }}>"{msg.originalText}"</div>
                    <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>
                      {isMe ? `Traduit en ${otherLangLabel}` : `Traduit en ${myLangLabel}`}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>{msg.translatedText}</div>
                  </>
                )}

                {msg.translatedText && (
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                    <button onClick={() => playMessage(msg)} title="Écouter la traduction" style={{ background: "#128C7E", color: "white", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>▶</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ background: "#f0f2f5", padding: "10px 12px", display: "flex", gap: 6, alignItems: "center", position: "sticky", bottom: 0 }}>
        {/* Inputs cachés */}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: "none" }} />
        <input ref={videoInputRef} type="file" accept="video/*" onChange={handleFileSelect} style={{ display: "none" }} />

        {/* Bouton Photo */}
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Envoyer une photo" style={{ background: "#25D366", border: "none", borderRadius: "50%", width: 40, height: 40, cursor: uploading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
        </button>

        {/* Bouton Vidéo */}
        <button onClick={() => videoInputRef.current?.click()} disabled={uploading} title="Envoyer une vidéo" style={{ background: "#25D366", border: "none", borderRadius: "50%", width: 40, height: 40, cursor: uploading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {uploading ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="10" opacity="0.3"/></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
            </svg>
          )}
        </button>

        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendMessage(text)}
          placeholder="Écrire un message..."
          style={{ flex: 1, padding: "10px 16px", border: "none", borderRadius: 24, fontSize: 15, outline: "none", background: "white" }}
        />

        {text.trim() ? (
          <button onClick={() => sendMessage(text)} disabled={sending} style={{ background: "#25D366", color: "white", border: "none", borderRadius: "50%", width: 44, height: 44, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {sending ? "..." : "➤"}
          </button>
        ) : (
          <button
            onClick={toggleRecording}
            style={{ background: recording ? "#ff3b30" : "#25D366", border: "none", borderRadius: "50%", width: 44, height: 44, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s", flexShrink: 0 }}
          >
            {recording ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
