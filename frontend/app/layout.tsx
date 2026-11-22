import "./globals.css";
import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { SessionProvider } from "@/components/SessionProvider";

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
  title: "Misaina Cognition — Données documentaires et collecte terrain",
  description:
    "Centralisez vos documents, recherchez vos sources et contrôlez la qualité des données terrain avec traçabilité et validation humaine.",
  openGraph: {
    title: "Misaina Cognition — Données documentaires et collecte terrain",
    description:
      "Une plateforme pour centraliser les connaissances, fiabiliser les collectes terrain et conserver une piste d'audit vérifiable.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${plusJakarta.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased selection:bg-primary/20 selection:text-primary">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
