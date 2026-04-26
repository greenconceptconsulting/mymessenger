import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        background: "linear-gradient(145deg, #25D366 0%, #0e7a6e 100%)",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width="120" height="120" viewBox="0 0 100 100" fill="none">
        <rect x="8" y="18" width="58" height="42" rx="12" fill="white" />
        <polygon points="16,60 8,74 28,60" fill="white" />
        <rect x="34" y="42" width="58" height="38" rx="12" fill="rgba(255,255,255,0.4)" />
        <polygon points="84,80 92,94 72,80" fill="rgba(255,255,255,0.4)" />
        <rect x="18" y="30" width="36" height="5" rx="2.5" fill="#25D366" />
        <rect x="18" y="42" width="24" height="5" rx="2.5" fill="#25D366" />
        <rect x="44" y="54" width="36" height="5" rx="2.5" fill="white" opacity="0.8" />
        <rect x="44" y="65" width="24" height="5" rx="2.5" fill="white" opacity="0.8" />
      </svg>
    </div>,
    { ...size }
  );
}
