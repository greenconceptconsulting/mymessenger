"use client";
import { useEffect, useState } from "react";

export default function InstallBanner() {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = (window.navigator as any).standalone;
    const dismissed = sessionStorage.getItem("install-dismissed");

    if (dismissed) return;

    if (ios && !standalone) {
      setIsIOS(true);
      setShow(true);
    }

    window.addEventListener("beforeinstallprompt", (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    });
  }, []);

  function dismiss() {
    setShow(false);
    sessionStorage.setItem("install-dismissed", "1");
  }

  async function install() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setShow(false);
    }
  }

  if (!show) return null;

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
      background: "#128C7E", color: "white",
      padding: "14px 16px 20px",
      boxShadow: "0 -4px 20px rgba(0,0,0,0.2)",
    }}>
      <button onClick={dismiss} style={{ position: "absolute", top: 10, right: 14, background: "none", border: "none", color: "white", fontSize: 20, cursor: "pointer", opacity: 0.7 }}>✕</button>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: "linear-gradient(135deg, #25D366, #128C7E)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, color: "white", border: "2px solid rgba(255,255,255,0.3)" }}>M</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Installer MyMessenger</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Accès rapide depuis votre écran d'accueil</div>
        </div>
      </div>

      {isIOS ? (
        <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "10px 14px", fontSize: 13, lineHeight: 1.6 }}>
          Appuyez sur <strong>↑ Partager</strong> en bas de Safari, puis <strong>"Sur l'écran d'accueil"</strong>
        </div>
      ) : (
        <button onClick={install} style={{ width: "100%", padding: "12px", background: "#25D366", color: "white", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          Installer l'application
        </button>
      )}
    </div>
  );
}
