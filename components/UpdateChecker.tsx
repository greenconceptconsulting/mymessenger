"use client";
import { useEffect, useState } from "react";

export default function UpdateChecker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let currentBuildId: string | null = null;

    async function checkForUpdate() {
      try {
        const res = await fetch("/", { cache: "no-store" });
        const html = await res.text();
        const match = html.match(/"buildId":"([^"]+)"/);
        if (!match) return;
        const remoteBuildId = match[1];
        if (currentBuildId === null) {
          currentBuildId = remoteBuildId;
        } else if (remoteBuildId !== currentBuildId) {
          setUpdateAvailable(true);
        }
      } catch {}
    }

    checkForUpdate();
    const interval = setInterval(checkForUpdate, 5 * 60 * 1000); // toutes les 5 min
    return () => clearInterval(interval);
  }, []);

  if (!updateAvailable) return null;

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 99999,
      background: "#128C7E", color: "white",
      padding: "12px 16px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
    }}>
      <span style={{ fontSize: 14, fontWeight: 600 }}>
        🔄 Nouvelle version disponible
      </span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: "white", color: "#128C7E", border: "none",
          borderRadius: 8, padding: "6px 14px", fontWeight: 700,
          fontSize: 13, cursor: "pointer",
        }}
      >
        Actualiser
      </button>
    </div>
  );
}
