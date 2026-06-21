import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import AppHeader from "./_components/AppHeader";

export const metadata: Metadata = {
  title: "Harbor-Index audit viewer",
  description: "Per-trial and per-task audits of Harbor-Index benchmark trials.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <Analytics />
      </body>
    </html>
  );
}
