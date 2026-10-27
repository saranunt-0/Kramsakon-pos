import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import { AuthProvider } from "@/components/auth";
import { Toaster } from "@/components/ui";
import "./globals.css";

const thai = IBM_Plex_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Kramsakon POS",
  description: "ระบบขายหน้าร้านและสต็อกสินค้า ร้านครามสกล",
  applicationName: "Kramsakon POS",
  appleWebApp: { capable: true, title: "Kramsakon POS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#263f74",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${thai.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <AuthProvider>{children}</AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
