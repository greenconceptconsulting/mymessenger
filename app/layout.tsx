import type { Metadata, Viewport } from "next";
import "./globals.css";
import InstallBanner from "@/components/InstallBanner";

export const metadata: Metadata = {
  title: "MyMessenger",
  description: "Messagerie vocale avec traduction automatique",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MyMessenger",
  },
};

export const viewport: Viewport = {
  themeColor: "#128C7E",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <InstallBanner />
        {children}
      </body>
    </html>
  );
}
