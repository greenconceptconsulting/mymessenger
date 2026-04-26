"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, onSnapshot, orderBy, query, serverTimestamp, doc, getDoc, updateDoc, where } from "firebase/firestore";
import { LANGUAGES, speakText, transcribeAudio } from "@/lib/speech";
import { translateText } from "@/lib/translate";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { playNotificationSound, requestNotificationPermission, showBrowserNotification } from "@/lib/notify";
import { initFCM } from "@/lib/fcm-client";

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  originalText: string;
  translatedText: string;
  originalLang: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio";
  deleted?: boolean;
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
  const [otherUserId, setOtherUserId] = useState("");
  const [showLangPicker, setShowLangPicker] = useState(false);
  // Appel
  const [callStatus, setCallStatus] = useState<"idle" | "calling" | "ringing" | "connected">("idle");
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [callDocId, setCallDocId] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const pendingTranscriptRef = useRef<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const prevMessageCountRef = useRef(0);
  const isFirstLoadRef = useRef(true);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setOtherUserId(otherId || "");
      setOtherName(data.participantNames?.[otherId] || "Contact");
      if (otherId) {
        const otherUserDoc = await getDoc(doc(db, "users", otherId));
        if (otherUserDoc.exists()) {
          const savedLang = data.langOverride?.[u.uid];
          setOtherLang(savedLang || otherUserDoc.data().language || "zh");
          setOtherPhoto(otherUserDoc.data().photoURL);
        }
      }
    });
  }, [id, router]);

  // Écoute des appels entrants
  useEffect(() => {
    if (!user || !id) return;
    const q = query(
      collection(db, "calls"),
      where("calleeId", "==", user.uid),
      where("conversationId", "==", id),
      where("status", "==", "ringing")
    );
    return onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const callDoc = snap.docs[0];
        const data = callDoc.data();
        if (data.offer) {
          setIncomingCall({ id: callDoc.id, ...data });
          setCallDocId(callDoc.id);
        }
      } else {
        setIncomingCall(null);
      }
    });
  }, [user, id]);

  useEffect(() => { requestNotificationPermission(); }, []);

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
        if (latest.senderId !== auth.currentUser?.uid) {
          playNotificationSound();
          showBrowserNotification(
            latest.senderName || "Nouveau message",
            latest.translatedText || latest.originalText || (latest.mediaType === "video" ? "📹 Vidéo" : latest.mediaType === "audio" ? "🎤 Vocal" : "📷 Photo")
          );
        }
      }
      prevMessageCountRef.current = newMessages.length;
    });
  }, [id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (callStatus === "connected") {
      callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      setCallDuration(0);
    }
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
  }, [callStatus]);

  function formatDuration(s: number) {
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  function createPeerConnection(isCallee: boolean, docId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnectionRef.current = pc;

    pc.ontrack = (event) => {
      if (!remoteAudioRef.current) remoteAudioRef.current = new Audio();
      remoteAudioRef.current.srcObject = event.streams[0];
      remoteAudioRef.current.play().catch(() => {});
    };

    const myCandidates = isCallee ? "calleeCandidates" : "callerCandidates";
    const theirCandidates = isCallee ? "callerCandidates" : "calleeCandidates";

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(collection(db, "calls", docId, myCandidates), event.candidate.toJSON());
      }
    };

    onSnapshot(collection(db, "calls", docId, theirCandidates), (snap) => {
      snap.docChanges().forEach(change => {
        if (change.type === "added") {
          pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
        }
      });
    });

    return pc;
  }

  async function startCall() {
    if (!user || !otherUserId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const callRef = await addDoc(collection(db, "calls"), {
        callerId: user.uid,
        calleeId: otherUserId,
        conversationId: id,
        status: "ringing",
        createdAt: serverTimestamp(),
      });
      setCallDocId(callRef.id);
      setCallStatus("calling");

      const pc = createPeerConnection(false, callRef.id);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await updateDoc(callRef, { offer: { type: offer.type, sdp: offer.sdp } });

      onSnapshot(doc(db, "calls", callRef.id), async (snap) => {
        const data = snap.data();
        if (data?.answer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          setCallStatus("connected");
        }
        if (data?.status === "ended") hangUp(false);
      });

      // Notification push pour l'appelé
      const otherDoc = await getDoc(doc(db, "users", otherUserId));
      const fcmToken = otherDoc.data()?.fcmToken;
      if (fcmToken) {
        fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: fcmToken,
            title: `📞 ${user.displayName || user.email}`,
            body: "Appel audio entrant...",
          }),
        });
      }
    } catch (e) {
      console.error(e);
      setCallStatus("idle");
    }
  }

  async function acceptCall() {
    if (!incomingCall) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const pc = createPeerConnection(true, incomingCall.id);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await updateDoc(doc(db, "calls", incomingCall.id), {
        answer: { type: answer.type, sdp: answer.sdp },
        status: "connected",
      });

      setCallStatus("connected");
      setIncomingCall(null);

      onSnapshot(doc(db, "calls", incomingCall.id), (snap) => {
        if (snap.data()?.status === "ended") hangUp(false);
      });
    } catch (e) {
      console.error(e);
    }
  }

  async function hangUp(updateFirestore = true) {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current = null;
    }
    if (updateFirestore && callDocId) {
      await updateDoc(doc(db, "calls", callDocId), { status: "ended" }).catch(() => {});
    }
    setCallStatus("idle");
    setIncomingCall(null);
    setCallDocId(null);
    setIsMuted(false);
  }

  function rejectCall() {
    if (callDocId) {
      updateDoc(doc(db, "calls", callDocId), { status: "ended" }).catch(() => {});
    }
    setIncomingCall(null);
    setCallDocId(null);
  }

  function toggleMute() {
    if (localStreamRef.current) {
      const nowMuted = !isMuted;
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !nowMuted; });
      setIsMuted(nowMuted);
    }
  }

  async function sendMessage(originalText: string, mediaUrl?: string, mediaType?: "image" | "video" | "audio") {
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
      const lastMsg = mediaUrl ? (mediaType === "video" ? "📹 Vidéo" : mediaType === "audio" ? "🎤 Vocal" : "📷 Photo") : translated;
      await updateDoc(doc(db, "conversations", id as string), { lastMessage: lastMsg, updatedAt: serverTimestamp() });

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
              body: JSON.stringify({ token: fcmToken, title: user.displayName || user.email || "MyMessenger", body: lastMsg || "Nouveau message" }),
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
      await sendMessage("", url, type as "image" | "video");
    } catch { alert("Erreur lors de l'envoi du fichier."); }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function toggleRecording() {
    if (recording) {
      recognitionRef.current?.stop();
      mediaRecorderRef.current?.stop();
    } else {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        alert("Accès au microphone refusé.");
        return;
      }
      setRecording(true);
      audioChunksRef.current = [];
      pendingTranscriptRef.current = "";

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "audio/webm";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        await new Promise(r => setTimeout(r, 600));
        const transcript = pendingTranscriptRef.current;
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setSending(true);
        try {
          const audioFile = new File([audioBlob], "voice.mp4", { type: mimeType });
          const { url } = await uploadToCloudinary(audioFile, "audio");
          await sendMessage(transcript, url, "audio");
        } catch { if (transcript) await sendMessage(transcript); }
        setSending(false);
        setRecording(false);
      };
      mediaRecorder.start(100);

      const myLangObj = LANGUAGES.find(l => l.code === myLang);
      if (myLangObj) {
        recognitionRef.current = transcribeAudio(
          myLangObj.speechCode,
          (transcript) => { pendingTranscriptRef.current = transcript; },
          () => {}
        );
      }
    }
  }

  async function changeOtherLang(newLang: string) {
    setOtherLang(newLang);
    setShowLangPicker(false);
    await updateDoc(doc(db, "conversations", id as string), { [`langOverride.${user?.uid}`]: newLang });
  }

  function handleMsgPressStart(msgId: string) {
    pressTimerRef.current = setTimeout(() => setSelectedMsgId(msgId), 500);
  }

  function handleMsgPressEnd() {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
  }

  async function deleteMessage(msgId: string) {
    await updateDoc(doc(db, "conversations", id as string, "messages", msgId), { deleted: true });
    setSelectedMsgId(null);
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

      {/* Overlay appel en cours */}
      {(callStatus === "calling" || callStatus === "connected") && (
        <div style={{ position: "fixed", inset: 0, background: "linear-gradient(180deg, #075E54 0%, #128C7E 100%)", zIndex: 100, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "white" }}>
          <div style={{ fontSize: 16, opacity: 0.8, marginBottom: 12 }}>
            {callStatus === "calling" ? "Appel en cours..." : `En communication • ${formatDuration(callDuration)}`}
          </div>
          {otherPhoto ? (
            <img src={otherPhoto} alt={otherName} style={{ width: 100, height: 100, borderRadius: "50%", objectFit: "cover", marginBottom: 16, border: "3px solid rgba(255,255,255,0.4)" }} />
          ) : (
            <div style={{ width: 100, height: 100, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, fontWeight: 700, marginBottom: 16 }}>
              {otherName[0]?.toUpperCase()}
            </div>
          )}
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>{otherName}</div>
          {callStatus === "calling" && <div style={{ fontSize: 14, opacity: 0.7 }}>En attente de réponse...</div>}

          <div style={{ display: "flex", gap: 40, marginTop: 60 }}>
            {callStatus === "connected" && (
              <button onClick={toggleMute} style={{ background: isMuted ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 64, height: 64, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "white", gap: 4 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill={isMuted ? "white" : "none"} stroke="white" strokeWidth="2">
                  {isMuted
                    ? <><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>
                    : <><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></>
                  }
                </svg>
                <span style={{ fontSize: 11 }}>{isMuted ? "Micro coupé" : "Micro"}</span>
              </button>
            )}
            <button onClick={() => hangUp(true)} style={{ background: "#ff3b30", border: "none", borderRadius: "50%", width: 64, height: 64, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "white", gap: 4 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
              <span style={{ fontSize: 11 }}>Raccrocher</span>
            </button>
          </div>
        </div>
      )}

      {/* Bannière appel entrant */}
      {incomingCall && callStatus === "idle" && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 99, maxWidth: 480, margin: "0 auto", background: "#075E54", color: "white", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>📞 Appel entrant</div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>{otherName}</div>
          </div>
          <button onClick={rejectCall} style={{ background: "#ff3b30", border: "none", borderRadius: "50%", width: 48, height: 48, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
          </button>
          <button onClick={acceptCall} style={{ background: "#25D366", border: "none", borderRadius: "50%", width: 48, height: 48, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
          </button>
        </div>
      )}

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
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>{otherName}</div>
          <button onClick={() => setShowLangPicker(v => !v)} style={{ background: "none", border: "none", color: "white", fontSize: 11, opacity: 0.9, cursor: "pointer", padding: 0, textDecoration: "underline dotted" }}>
            Vous: {myLangLabel} → Lui: {otherLangLabel} ✏️
          </button>
        </div>
        {/* Bouton appel */}
        <button onClick={startCall} title="Appel audio" style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 38, height: 38, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
        </button>
      </div>

      {/* Sélecteur de langue */}
      {showLangPicker && (
        <div style={{ background: "white", borderBottom: "1px solid #ddd", padding: "10px 16px", zIndex: 9 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#333" }}>Langue de {otherName} :</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {LANGUAGES.map(l => (
              <button key={l.code} onClick={() => changeOtherLang(l.code)} style={{ padding: "6px 12px", borderRadius: 16, border: "1px solid #128C7E", background: otherLang === l.code ? "#128C7E" : "white", color: otherLang === l.code ? "white" : "#128C7E", fontSize: 13, cursor: "pointer" }}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      )}

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
              <div
                onTouchStart={() => handleMsgPressStart(msg.id)}
                onTouchEnd={handleMsgPressEnd}
                onMouseDown={() => handleMsgPressStart(msg.id)}
                onMouseUp={handleMsgPressEnd}
                onMouseLeave={handleMsgPressEnd}
                style={{ maxWidth: "75%", background: isMe ? "#DCF8C6" : "white", borderRadius: isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px", padding: "10px 14px", boxShadow: "0 1px 2px rgba(0,0,0,0.1)", cursor: "pointer", outline: selectedMsgId === msg.id ? "2px solid #128C7E" : "none", userSelect: "none" }}
              >
                {!isMe && <div style={{ fontSize: 12, fontWeight: 600, color: "#128C7E", marginBottom: 4 }}>{msg.senderName}</div>}

                {msg.deleted ? (
                  <div style={{ color: "#999", fontStyle: "italic", fontSize: 14 }}>🚫 Message supprimé</div>
                ) : (
                  <>
                    {msg.mediaUrl && msg.mediaType === "image" && <img src={msg.mediaUrl} alt="photo" style={{ width: "100%", borderRadius: 8, marginBottom: 6, display: "block" }} />}
                    {msg.mediaUrl && msg.mediaType === "video" && <video src={msg.mediaUrl} controls style={{ width: "100%", borderRadius: 8, marginBottom: 6, display: "block" }} />}
                    {msg.mediaUrl && msg.mediaType === "audio" && <audio src={msg.mediaUrl} controls style={{ width: "100%", marginBottom: 6 }} />}
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
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* Menu suppression message */}
        {selectedMsgId && (
          <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "flex-end" }} onClick={() => setSelectedMsgId(null)}>
            <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "white", borderRadius: "16px 16px 0 0", padding: 20, boxShadow: "0 -4px 20px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
              <div style={{ width: 36, height: 4, background: "#ddd", borderRadius: 2, margin: "0 auto 16px" }} />
              <button
                onClick={() => deleteMessage(selectedMsgId)}
                style={{ width: "100%", padding: "14px", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#ff3b30", display: "flex", alignItems: "center", gap: 12, borderRadius: 8 }}
              >
                🗑️ Supprimer ce message
              </button>
              <button
                onClick={() => setSelectedMsgId(null)}
                style={{ width: "100%", padding: "14px", background: "#f0f2f5", border: "none", cursor: "pointer", fontSize: 16, color: "#333", borderRadius: 8, marginTop: 8 }}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ background: "#f0f2f5", padding: "10px 12px", display: "flex", gap: 6, alignItems: "center", position: "sticky", bottom: 0 }}>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: "none" }} />
        <input ref={videoInputRef} type="file" accept="video/*" onChange={handleFileSelect} style={{ display: "none" }} />
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Envoyer une photo" style={{ background: "#25D366", border: "none", borderRadius: "50%", width: 40, height: 40, cursor: uploading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
        </button>
        <button onClick={() => videoInputRef.current?.click()} disabled={uploading} title="Envoyer une vidéo" style={{ background: "#25D366", border: "none", borderRadius: "50%", width: 40, height: 40, cursor: uploading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
          </svg>
        </button>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage(text)} placeholder="Écrire un message..." style={{ flex: 1, padding: "10px 16px", border: "none", borderRadius: 24, fontSize: 15, outline: "none", background: "white" }} />
        {text.trim() ? (
          <button onClick={() => sendMessage(text)} disabled={sending} style={{ background: "#25D366", color: "white", border: "none", borderRadius: "50%", width: 44, height: 44, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {sending ? "..." : "➤"}
          </button>
        ) : (
          <button onClick={toggleRecording} style={{ background: recording ? "#ff3b30" : "#25D366", border: "none", borderRadius: "50%", width: 44, height: 44, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s", flexShrink: 0 }}>
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
