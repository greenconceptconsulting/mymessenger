"use client";
import { useState } from "react";
import { auth } from "@/lib/firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        await setDoc(doc(db, "users", cred.user.uid), {
          name,
          email,
          ...(phone.trim() && { phone: phone.trim() }),
        }, { merge: true });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      router.push("/chat");
    } catch (err: any) {
      if (err.code === "auth/email-already-in-use") setError("Cet email est déjà utilisé.");
      else if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") setError("Email ou mot de passe incorrect.");
      else if (err.code === "auth/weak-password") setError("Mot de passe trop court (6 caractères minimum).");
      else setError("Erreur : " + err.message);
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)" }}>
      <div style={{ background: "white", borderRadius: 16, padding: 40, width: "100%", maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🌍</div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#128C7E" }}>MyMessenger</h1>
          <p style={{ margin: "8px 0 0", color: "#666", fontSize: 14 }}>Parlez dans votre langue, soyez compris dans la leur</p>
        </div>

        <div style={{ display: "flex", marginBottom: 24, background: "#f0f2f5", borderRadius: 8, padding: 4 }}>
          {(["login", "register"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: "8px 0", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 14, background: mode === m ? "white" : "transparent", color: mode === m ? "#128C7E" : "#666", boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.1)" : "none", transition: "all 0.2s" }}>
              {m === "login" ? "Connexion" : "Inscription"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {mode === "register" && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14, color: "#333" }}>Votre prénom</label>
                <input value={name} onChange={e => setName(e.target.value)} required placeholder="Ex: Gregory" style={{ width: "100%", padding: "12px 16px", border: "1px solid #ddd", borderRadius: 8, fontSize: 15, outline: "none" }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14, color: "#333" }}>Téléphone <span style={{ color: "#999", fontWeight: 400 }}>(optionnel)</span></label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ex: +33612345678" style={{ width: "100%", padding: "12px 16px", border: "1px solid #ddd", borderRadius: 8, fontSize: 15, outline: "none" }} />
              </div>
            </>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14, color: "#333" }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="votre@email.com" style={{ width: "100%", padding: "12px 16px", border: "1px solid #ddd", borderRadius: 8, fontSize: 15, outline: "none" }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14, color: "#333" }}>Mot de passe</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="6 caractères minimum" style={{ width: "100%", padding: "12px 16px", border: "1px solid #ddd", borderRadius: 8, fontSize: 15, outline: "none" }} />
          </div>
          {error && <div style={{ background: "#fee", color: "#c00", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ width: "100%", padding: "14px", background: loading ? "#aaa" : "#25D366", color: "white", border: "none", borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}>
            {loading ? "Chargement..." : mode === "login" ? "Se connecter" : "Créer mon compte"}
          </button>
        </form>
      </div>
    </div>
  );
}
