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
  title: "Misaina Cognition — Plateforme MEAL autonome",
  description:
    "Plateforme MEAL (Monitoring, Evaluation, Accountability & Learning) : contrôle qualité autonome, déduplication, GPS/zone et suivi des enquêteurs.",
  openGraph: {
    title: "Misaina Cognition — Plateforme MEAL autonome",
    description:
      "Plateforme MEAL (Monitoring, Evaluation, Accountability & Learning) : contrôle qualité autonome, déduplication, GPS/zone et suivi des enquêteurs.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${plusJakarta.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
