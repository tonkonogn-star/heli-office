import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Офис",
  description: "Рабочее пространство Максима: Heliclub и стройка",
  appleWebApp: { capable: true, title: "Офис", statusBarStyle: "default" },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-512.png", apple: "/icon-180.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F6F6" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
      </head>
      <body>{children}</body>
    </html>
  );
}
