"use client";
import { useEffect, useRef, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, doc, getDoc, setDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { LANGUAGES } from "@/lib/speech";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { playNotificationSound, requestNotificationPermission, showBrowserNotification } from "@/lib/notify";
import { initFCM } from "@/lib/fcm-client";

const CATEGORIES = ["Tous", "Pro", "Famille", "Amis", "Autre"];

interface Conversation {
  id: string;
  participants: string[];
  participantNames: Record<string, string>;
  participantPhotos: Record<string, string>;
  lastMessage: string;
  category?: string;
  updatedAt: any;
}

function Avatar({ name, photoURL, size = 48 }: { name: string; photoURL?: string; size?: number }) {
  if (photoURL) {
    return <img src={photoURL} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: size * 0.38, flexShrink: 0 }}>
      {name[0]?.toUpperCase()}
    </div>
  );
}

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [myLang, setMyLang] = useState("fr");
  const [myPhoto, setMyPhoto] = useState<string | undefined>();
  const [langSaved, setLangSaved] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [searchMode, setSearchMode] = useState<"email" | "phone">("email");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [activeTab, setActiveTab] = useState("Tous");
  const [categoryMenu, setCategoryMenu] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const prevConvsRef = useRef<Record<string, string>>({});
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/"); return; }
      setUser(u);
      initFCM(u.uid);
      const userDoc = await getDoc(doc(db, "users", u.uid));
      if (userDoc.exists()) {
        setMyLang(userDoc.data().language || "fr");
        setMyPhoto(userDoc.data().photoURL);
        setLangSaved(true);
      }
    });
  }, [router]);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "conversations"), where("participants", "array-contains", user.uid));
    return onSnapshot(q, (snap) => {
      const convs = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Conversation))
        .filter(c => !(c as any).deletedFor?.includes(user.uid));
      convs.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      setConversations(convs);

      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
        convs.forEach(c => { prevConvsRef.current[c.id] = c.lastMessage; });
        return;
      }

      convs.forEach(c => {
        if (c.lastMessage && c.lastMessage !== prevConvsRef.current[c.id]) {
          const otherId = c.participants.find(p => p !== user.uid) || "";
          const otherName = c.participantNames?.[otherId] || "Contact";
          playNotificationSound();
          showBrowserNotification(otherName, c.lastMessage);
          prevConvsRef.current[c.id] = c.lastMessage;
        }
      });
    });
  }, [user]);

  async function saveLanguage() {
    if (!user) return;
    await setDoc(doc(db, "users", user.uid), { language: myLang, name: user.displayName, email: user.email }, { merge: true });
    setLangSaved(true);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingPhoto(true);
    try {
      const { url } = await uploadToCloudinary(file);
      await setDoc(doc(db, "users", user.uid), { photoURL: url }, { merge: true });
      setMyPhoto(url);
    } catch {
      alert("Erreur lors de l'upload de la photo.");
    }
    setUploadingPhoto(false);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  async function setCategory(convId: string, category: string) {
    const { updateDoc, doc } = await import("firebase/firestore");
    await updateDoc(doc(db, "conversations", convId), { category });
    setCategoryMenu(null);
  }

  async function deleteConversation(convId: string) {
    if (!window.confirm("Supprimer cette conversation de ta liste ?")) return;
    await updateDoc(doc(db, "conversations", convId), { deletedFor: arrayUnion(user.uid) });
    setCategoryMenu(null);
  }

  async function startConversation() {
    setError("");
    const input = newEmail.trim();
    if (!input) return;
    setLoading(true);
    try {
      const { getDocs, query: fsQuery, collection: fsCol, where } = await import("firebase/firestore");
      const field = searchMode === "phone" ? "phone" : "email";
      const usersSnap = await getDocs(fsQuery(fsCol(db, "users"), where(field, "==", input)));
      if (usersSnap.empty) {
        setError(searchMode === "phone"
          ? "Aucun utilisateur trouvé avec ce numéro. Il doit d'abord créer un compte."
          : "Aucun utilisateur trouvé avec cet email. Il doit d'abord créer un compte.");
        setLoading(false);
        return;
      }
      const otherUser = usersSnap.docs[0];
      const otherId = otherUser.id;
      if (otherId === user.uid) { setError("Vous ne pouvez pas vous contacter vous-même."); setLoading(false); return; }

      const existing = conversations.find(c => c.participants.includes(otherId));
      if (existing) { router.push(`/chat/${existing.id}`); return; }

      const convRef = await addDoc(collection(db, "conversations"), {
        participants: [user.uid, otherId],
        participantNames: { [user.uid]: user.displayName || user.email, [otherId]: otherUser.data().name || otherUser.data().email },
        participantPhotos: { [user.uid]: myPhoto || "", [otherId]: otherUser.data().photoURL || "" },
        lastMessage: "",
        updatedAt: serverTimestamp(),
      });
      router.push(`/chat/${convRef.id}`);
    } catch (e: any) {
      setError("Erreur : " + e.message);
    }
    setLoading(false);
  }

  if (!user) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>Chargement...</div>;

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: "white", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: "#128C7E", color: "white", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Avatar cliquable */}
          <div style={{ position: "relative", cursor: "pointer" }} onClick={() => photoInputRef.current?.click()} title="Changer ma photo de profil">
            <Avatar name={user.displayName || user.email} photoURL={myPhoto} size={42} />
            <div style={{ position: "absolute", bottom: 0, right: 0, background: "#25D366", borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #128C7E" }}>
              {uploadingPhoto ? "⏳" : <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>}
            </div>
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>MyMessenger 🌍</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>{user.displayName || user.email}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => router.push("/translate")} title="Traducteur en direct" style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>🎙️ Direct</button>
          <button onClick={() => signOut(auth)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>Déconnexion</button>
        </div>
      </div>

      {/* Language selector */}
      {!langSaved && (
        <div style={{ background: "#e8f5e9", padding: 16, borderBottom: "1px solid #ddd" }}>
          <p style={{ margin: "0 0 10px", fontWeight: 600, fontSize: 14 }}>Choisissez votre langue pour commencer :</p>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={myLang} onChange={e => setMyLang(e.target.value)} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14 }}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <button onClick={saveLanguage} style={{ background: "#25D366", color: "white", border: "none", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Valider</button>
          </div>
        </div>
      )}

      {langSaved && (
        <div style={{ background: "#f0f2f5", padding: "8px 16px", borderBottom: "1px solid #ddd", display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span>Votre langue : <strong>{LANGUAGES.find(l => l.code === myLang)?.label}</strong></span>
          <button onClick={() => setLangSaved(false)} style={{ background: "none", border: "none", color: "#128C7E", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}>Changer</button>
        </div>
      )}

      {/* New conversation */}
      <div style={{ padding: 16, borderBottom: "1px solid #eee" }}>
        <p style={{ margin: "0 0 10px", fontWeight: 600, fontSize: 14 }}>Nouvelle conversation</p>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <button onClick={() => { setSearchMode("email"); setNewEmail(""); setError(""); }} style={{ flex: 1, padding: "7px 0", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13, background: searchMode === "email" ? "#128C7E" : "#f0f2f5", color: searchMode === "email" ? "white" : "#666", transition: "all 0.2s" }}>
            ✉️ Par Email
          </button>
          <button onClick={() => { setSearchMode("phone"); setNewEmail(""); setError(""); }} style={{ flex: 1, padding: "7px 0", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13, background: searchMode === "phone" ? "#128C7E" : "#f0f2f5", color: searchMode === "phone" ? "white" : "#666", transition: "all 0.2s" }}>
            📱 Par Téléphone
          </button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && startConversation()}
            placeholder={searchMode === "phone" ? "Ex: +33612345678" : "votre@contact.com"}
            type={searchMode === "phone" ? "tel" : "email"}
            style={{ flex: 1, padding: "10px 14px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, outline: "none" }}
          />
          <button onClick={startConversation} disabled={loading} style={{ background: "#25D366", color: "white", border: "none", padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
            {loading ? "..." : "Démarrer"}
          </button>
        </div>
        {error && <div style={{ color: "#c00", fontSize: 13, marginTop: 8 }}>{error}</div>}
      </div>

      {/* Onglets catégories */}
      <div style={{ display: "flex", overflowX: "auto", borderBottom: "1px solid #eee", background: "white" }}>
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setActiveTab(cat)} style={{ padding: "10px 16px", border: "none", background: "none", cursor: "pointer", fontWeight: activeTab === cat ? 700 : 400, color: activeTab === cat ? "#128C7E" : "#666", borderBottom: activeTab === cat ? "2px solid #128C7E" : "2px solid transparent", fontSize: 14, whiteSpace: "nowrap", transition: "all 0.2s" }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Conversations list */}
      <div style={{ flex: 1, overflowY: "auto" }} onClick={() => setCategoryMenu(null)}>
        {conversations.filter(c => activeTab === "Tous" || c.category === activeTab).length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
            <p>Aucune conversation {activeTab !== "Tous" ? `dans "${activeTab}"` : ""}.</p>
            <p style={{ fontSize: 13 }}>Entrez l'email d'un contact pour commencer.</p>
          </div>
        ) : (
          conversations.filter(c => activeTab === "Tous" || c.category === activeTab).map(conv => {
            const otherId = conv.participants.find(p => p !== user.uid) || "";
            const otherName = conv.participantNames?.[otherId] || "Contact";
            const otherPhoto = conv.participantPhotos?.[otherId];
            return (
              <div key={conv.id} style={{ padding: "14px 20px", borderBottom: "1px solid #f0f2f5", display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
                <div onClick={() => router.push(`/chat/${conv.id}`)} style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, cursor: "pointer", minWidth: 0 }}>
                  <Avatar name={otherName} photoURL={otherPhoto} size={48} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{otherName}</span>
                      {conv.category && conv.category !== "Tous" && (
                        <span style={{ fontSize: 10, background: "#e8f5e9", color: "#128C7E", padding: "2px 6px", borderRadius: 10, fontWeight: 600 }}>{conv.category}</span>
                      )}
                    </div>
                    <div style={{ color: "#999", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{conv.lastMessage || "Commencez la conversation"}</div>
                  </div>
                </div>

                {/* Bouton catégorie */}
                <div style={{ position: "relative" }}>
                  <button onClick={(e) => { e.stopPropagation(); setCategoryMenu(categoryMenu === conv.id ? null : conv.id); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#999", padding: "4px 8px" }}>⋮</button>
                  {categoryMenu === conv.id && (
                    <div style={{ position: "absolute", right: 0, top: 30, background: "white", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", borderRadius: 10, zIndex: 100, minWidth: 160, overflow: "hidden" }}>
                      <div style={{ padding: "8px 14px", fontSize: 12, color: "#999", fontWeight: 600, borderBottom: "1px solid #eee" }}>Classer dans...</div>
                      {CATEGORIES.filter(c => c !== "Tous").map(cat => (
                        <div key={cat} onClick={(e) => { e.stopPropagation(); setCategory(conv.id, cat); }} style={{ padding: "10px 14px", cursor: "pointer", fontSize: 14, background: conv.category === cat ? "#e8f5e9" : "white", color: conv.category === cat ? "#128C7E" : "#333", fontWeight: conv.category === cat ? 600 : 400 }}>
                          {cat}
                        </div>
                      ))}
                      <div style={{ borderTop: "1px solid #eee" }}>
                        <div onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }} style={{ padding: "10px 14px", cursor: "pointer", fontSize: 14, color: "#ff3b30", display: "flex", alignItems: "center", gap: 8 }}>
                          🗑️ Supprimer
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
