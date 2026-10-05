import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Travel Helm — Billetterie interurbaine multi-compagnies",
  description:
    "Plateforme SaaS pour transporteurs interurbains au Bénin : inventaire unique guichet/web, sélection de sièges réelle, paiement Mobile Money, billets QR vérifiables et embarquement traçable.",
  keywords: ["Travel Helm", "billetterie", "transport interurbain", "Bénin", "Cotonou", "Parakou", "SaaS transport"],
  icons: {
    icon:
      "data:image/svg+xml," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0b6e47"/><g stroke="#f2ead2" stroke-width="2.2" stroke-linecap="round"><circle cx="16" cy="16" r="7.5" fill="none"/><path d="M16 4.5v4M16 23.5v4M4.5 16h4M23.5 16h4M7.9 7.9l2.8 2.8M21.3 21.3l2.8 2.8M24.1 7.9l-2.8 2.8M10.7 21.3l-2.8 2.8"/></g><circle cx="16" cy="16" r="2.6" fill="#e8a33d" stroke="none"/></svg>`
      ),
  },
};

export const viewport: Viewport = {
  themeColor: "#0b6e47",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
