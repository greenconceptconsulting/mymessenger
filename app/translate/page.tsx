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
  const [myOriginal, setMyOriginal] = useState("");
  const [myTranslated, setMyTranslated] = useState("");
  const [theirOriginal, setTheirOriginal] = useState("");
  const [theirTranslated, setTheirTranslated] = useState("");
  const [translating, setTranslating] = useState(false);
  const recognitionRef = useRef<any>(null);

  const myLangObj = LANGUAGES.find(l => l.code === myLang)!;
  const theirLangObj = LANGUAGES.find(l => l.code === theirLang)!;

  async function handleSpeak(speaker: "me" | "them") {
    if (recording) return;
    const sourceLangObj = speaker === "me" ? myLangObj : theirLangObj;
    const targetLangObj = speaker === "me" ? theirLangObj : myLangObj;
    const sourceLang = speaker === "me" ? myLang : theirLang;
    const targetLang = speaker === "me" ? theirLang : myLang;

    if (speaker === "me") { setMyOriginal(""); setMyTranslated(""); }
    else { setTheirOriginal(""); setTheirTranslated(""); }
    setRecording(speaker);

    recognitionRef.current = transcribeAudio(
      sourceLangObj.speechCode,
      async (transcript) => {
        setTranslating(true);
        if (speaker === "me") setMyOriginal(transcript);
        else setTheirOriginal(transcript);

        try {
          const translated = await translateText(transcript, sourceLang, targetLang);
          if (speaker === "me") setMyTranslated(translated);
          else setTheirTranslated(translated);
        } catch {
          if (speaker === "me") setMyTranslated("Erreur de traduction");
          else setTheirTranslated("Erreur de traduction");
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

  // Appelé directement depuis un tap utilisateur → fonctionne sur iOS
  function playTranslation(text: string, speechCode: string) {
    speakText(text, speechCode);
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
      <div style={{ flex: 1, padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Ma bulle — ce que je dis + traduction pour lui */}
        <div style={{ background: "#DCF8C6", borderRadius: "12px 12px 2px 12px", padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", minHeight: 80 }}>
          <div style={{ fontSize: 11, color: "#128C7E", fontWeight: 600, marginBottom: 6 }}>Moi → {theirLangObj.label}</div>
          {recording === "me" ? (
            <div style={{ color: "#ff3b30", fontStyle: "italic", fontSize: 15 }}>Écoute en cours...</div>
          ) : myOriginal ? (
            <>
              <div style={{ fontSize: 13, color: "#777", fontStyle: "italic", marginBottom: 4 }}>"{myOriginal}"</div>
              {myTranslated ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 17, fontWeight: 600, color: "#222", flex: 1 }}>{myTranslated}</div>
                  <button
                    onClick={() => playTranslation(myTranslated, theirLangObj.speechCode)}
                    style={{ background: "#128C7E", border: "none", borderRadius: "50%", width: 40, height: 40, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </button>
                </div>
              ) : translating ? (
                <div style={{ color: "#999", fontSize: 13 }}>Traduction...</div>
              ) : null}
            </>
          ) : (
            <div style={{ color: "#aaa", fontStyle: "italic", fontSize: 14 }}>Votre traduction apparaîtra ici</div>
          )}
        </div>

        {/* Sa bulle — ce qu'il dit + traduction pour moi */}
        <div style={{ background: "white", borderRadius: "12px 12px 12px 2px", padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", minHeight: 80 }}>
          <div style={{ fontSize: 11, color: "#e65100", fontWeight: 600, marginBottom: 6 }}>Lui → {myLangObj.label}</div>
          {recording === "them" ? (
            <div style={{ color: "#ff3b30", fontStyle: "italic", fontSize: 15 }}>Écoute en cours...</div>
          ) : theirOriginal ? (
            <>
              <div style={{ fontSize: 13, color: "#777", fontStyle: "italic", marginBottom: 4 }}>"{theirOriginal}"</div>
              {theirTranslated ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 17, fontWeight: 600, color: "#222", flex: 1 }}>{theirTranslated}</div>
                  <button
                    onClick={() => playTranslation(theirTranslated, myLangObj.speechCode)}
                    style={{ background: "#e65100", border: "none", borderRadius: "50%", width: 40, height: 40, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </button>
                </div>
              ) : translating ? (
                <div style={{ color: "#999", fontSize: 13 }}>Traduction...</div>
              ) : null}
            </>
          ) : (
            <div style={{ color: "#aaa", fontStyle: "italic", fontSize: 14 }}>Sa traduction apparaîtra ici</div>
          )}
        </div>
      </div>

      {/* Big buttons */}
      <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 12 }}>
        <button
          onMouseDown={() => handleSpeak("me")}
          onMouseUp={stopRecording}
          onTouchStart={() => handleSpeak("me")}
          onTouchEnd={stopRecording}
          disabled={recording === "them" || translating}
          style={{
            background: recording === "me" ? "#ff3b30" : "#25D366",
            color: "white", border: "none", borderRadius: 16, padding: "20px",
            fontSize: 17, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            boxShadow: recording === "me" ? "0 0 0 6px rgba(255,59,48,0.25)" : "0 4px 12px rgba(37,211,102,0.4)",
            transition: "all 0.2s", opacity: recording === "them" || translating ? 0.4 : 1
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {recording === "me"
              ? <rect x="6" y="6" width="12" height="12" rx="2" fill="white"/>
              : <><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></>
            }
          </svg>
          {recording === "me" ? "Relâcher pour traduire" : `Je parle (${myLangObj.label})`}
        </button>

        <button
          onMouseDown={() => handleSpeak("them")}
          onMouseUp={stopRecording}
          onTouchStart={() => handleSpeak("them")}
          onTouchEnd={stopRecording}
          disabled={recording === "me" || translating}
          style={{
            background: recording === "them" ? "#ff3b30" : "#FF9500",
            color: "white", border: "none", borderRadius: 16, padding: "20px",
            fontSize: 17, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            boxShadow: recording === "them" ? "0 0 0 6px rgba(255,59,48,0.25)" : "0 4px 12px rgba(255,149,0,0.4)",
            transition: "all 0.2s", opacity: recording === "me" || translating ? 0.4 : 1
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {recording === "them"
              ? <rect x="6" y="6" width="12" height="12" rx="2" fill="white"/>
              : <><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></>
            }
          </svg>
          {recording === "them" ? "Relâcher pour traduire" : `Il parle (${theirLangObj.label})`}
        </button>
      </div>
    </div>
  );
}
