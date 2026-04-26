"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGES, speakText, transcribeAudio } from "@/lib/speech";
import { translateText } from "@/lib/translate";

export default function TranslatePage() {
  const router = useRouter();
  const [myLang, setMyLang] = useState("fr");
  const [theirLang, setTheirLang] = useState("zh");
  const [recording, setRecording] = useState<"me" | "them" | null>(null);
  const [myText, setMyText] = useState("");
  const [theirText, setTheirText] = useState("");
  const [translating, setTranslating] = useState(false);
  const recognitionRef = useRef<any>(null);

  const myLangObj = LANGUAGES.find(l => l.code === myLang)!;
  const theirLangObj = LANGUAGES.find(l => l.code === theirLang)!;

  function unlockSpeech() {
    // Déverrouille la synthèse vocale sur mobile (doit être appelé depuis un geste utilisateur)
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }

  async function handleSpeak(speaker: "me" | "them") {
    if (recording) return;
    unlockSpeech();
    const sourceLang = speaker === "me" ? myLang : theirLang;
    const targetLang = speaker === "me" ? theirLang : myLang;
    const sourceLangObj = speaker === "me" ? myLangObj : theirLangObj;
    const targetLangObj = speaker === "me" ? theirLangObj : myLangObj;

    setRecording(speaker);
    if (speaker === "me") { setMyText(""); }
    else { setTheirText(""); }

    recognitionRef.current = transcribeAudio(
      sourceLangObj.speechCode,
      async (transcript) => {
        setTranslating(true);
        if (speaker === "me") setMyText(transcript);
        else setTheirText(transcript);

        try {
          const translated = await translateText(transcript, sourceLang, targetLang);
          if (speaker === "me") setTheirText(translated);
          else setMyText(translated);
          speakText(translated, targetLangObj.speechCode);
        } catch {
          if (speaker === "me") setTheirText("Erreur de traduction");
          else setMyText("Erreur de traduction");
        }
        setTranslating(false);
      },
      () => setRecording(null)
    );

    if (!recognitionRef.current) {
      alert("La reconnaissance vocale n'est pas supportée. Utilisez Chrome.");
      setRecording(null);
    }
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setRecording(null);
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: "#f0f2f5", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: "#128C7E", color: "white", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "white", fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Traducteur en direct</div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>Parlez chacun votre tour</div>
        </div>
      </div>

      {/* Language selectors */}
      <div style={{ background: "white", padding: "14px 16px", borderBottom: "1px solid #eee", display: "flex", alignItems: "center", gap: 10 }}>
        <select value={myLang} onChange={e => setMyLang(e.target.value)} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, background: "#e8f5e9", color: "#128C7E", fontWeight: 600 }}>
          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
        <div style={{ fontSize: 20, color: "#999" }}>⇄</div>
        <select value={theirLang} onChange={e => setTheirLang(e.target.value)} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, background: "#fff3e0", color: "#e65100", fontWeight: 600 }}>
          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>

      {/* Display area */}
      <div style={{ flex: 1, padding: "20px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* My text bubble */}
        <div style={{ background: "#DCF8C6", borderRadius: "12px 12px 2px 12px", padding: "14px 18px", minHeight: 70, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: 11, color: "#128C7E", fontWeight: 600, marginBottom: 6 }}>Moi ({myLangObj.label})</div>
          <div style={{ fontSize: 16, color: "#333", minHeight: 24 }}>
            {recording === "me" ? <span style={{ color: "#ff3b30", fontStyle: "italic" }}>Écoute en cours...</span> : myText || <span style={{ color: "#aaa", fontStyle: "italic" }}>Votre parole apparaîtra ici</span>}
          </div>
        </div>

        {/* Their text bubble */}
        <div style={{ background: "white", borderRadius: "12px 12px 12px 2px", padding: "14px 18px", minHeight: 70, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: 11, color: "#e65100", fontWeight: 600, marginBottom: 6 }}>Lui ({theirLangObj.label})</div>
          <div style={{ fontSize: 16, color: "#333", minHeight: 24 }}>
            {recording === "them" ? <span style={{ color: "#ff3b30", fontStyle: "italic" }}>Écoute en cours...</span> : theirText || <span style={{ color: "#aaa", fontStyle: "italic" }}>Sa parole apparaîtra ici</span>}
          </div>
        </div>

        {translating && (
          <div style={{ textAlign: "center", color: "#128C7E", fontSize: 13, fontStyle: "italic" }}>Traduction en cours...</div>
        )}
      </div>

      {/* Big buttons */}
      <div style={{ padding: "20px 16px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* My button */}
        <button
          onMouseDown={() => handleSpeak("me")}
          onMouseUp={stopRecording}
          onTouchStart={() => handleSpeak("me")}
          onTouchEnd={stopRecording}
          disabled={recording === "them" || translating}
          style={{
            background: recording === "me" ? "#ff3b30" : "#25D366",
            color: "white", border: "none", borderRadius: 16, padding: "22px 20px",
            fontSize: 18, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            boxShadow: recording === "me" ? "0 0 0 6px rgba(255,59,48,0.3)" : "0 4px 12px rgba(37,211,102,0.4)",
            transition: "all 0.2s", opacity: recording === "them" || translating ? 0.5 : 1
          }}
        >
          {recording === "me" ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>
            </svg>
          )}
          {recording === "me" ? "Relâcher pour traduire" : `Je parle (${myLangObj.label})`}
        </button>

        {/* Their button */}
        <button
          onMouseDown={() => handleSpeak("them")}
          onMouseUp={stopRecording}
          onTouchStart={() => handleSpeak("them")}
          onTouchEnd={stopRecording}
          disabled={recording === "me" || translating}
          style={{
            background: recording === "them" ? "#ff3b30" : "#FF9500",
            color: "white", border: "none", borderRadius: 16, padding: "22px 20px",
            fontSize: 18, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            boxShadow: recording === "them" ? "0 0 0 6px rgba(255,59,48,0.3)" : "0 4px 12px rgba(255,149,0,0.4)",
            transition: "all 0.2s", opacity: recording === "me" || translating ? 0.5 : 1
          }}
        >
          {recording === "them" ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>
            </svg>
          )}
          {recording === "them" ? "Relâcher pour traduire" : `Il parle (${theirLangObj.label})`}
        </button>
      </div>
    </div>
  );
}
