import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "22%",
        color: "white",
        fontSize: 280,
        fontWeight: 700,
      }}
    >
      M
    </div>,
    { ...size }
  );
}
