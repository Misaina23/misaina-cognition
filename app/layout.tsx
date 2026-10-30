import "./globals.css";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono, Lora } from "next/font/google";
import { Providers } from "./providers";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Misaina Cognition — Plateforme RAG & Gouvernance Institutionnelle",
  description: "Plateforme d'intelligence documentaire, gouvernance RAG et conformité pour organisations internationales et entreprises",
  openGraph: {
    title: "Misaina Cognition — Plateforme RAG & Gouvernance Institutionnelle",
    description: "Plateforme d'intelligence documentaire, gouvernance RAG et conformité pour organisations internationales et entreprises",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${plusJakarta.variable} ${lora.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased selection:bg-primary/20 selection:text-primary">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
