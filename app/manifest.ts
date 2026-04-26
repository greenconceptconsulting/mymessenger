import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyMessenger",
    short_name: "MyMessenger",
    description: "Messagerie vocale avec traduction automatique",
    start_url: "/chat",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#128C7E",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
