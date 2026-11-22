import "./globals.css";
import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Misaina Cognition — Moteur de Connaissance Souverain & Gouvernance RAG",
  description:
    "Plateforme d'intelligence documentaire, gouvernance RAG hybride BM25 et vecteurs denses, traçabilité cryptographique et isolation multitenant SecNumCloud et PSSI.",
  openGraph: {
    title: "Misaina Cognition — Moteur de Connaissance Souverain & Gouvernance RAG",
    description:
      "Fédérez les silos documentaires de votre groupe dans un pipeline certifié BM25 et vecteurs denses avec traçabilité cryptographique des citations.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${plusJakarta.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased selection:bg-primary/20 selection:text-primary">
        {children}
      </body>
    </html>
  );
}
