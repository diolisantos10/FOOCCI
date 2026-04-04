import type { Metadata } from "next";
import localFont from "next/font/local";
import { SessionProvider } from "@/components/providers/SessionProvider";
import "./globals.css";

const inter = localFont({
  src: [
    { path: "../../public/fonts/inter-400.woff2",          weight: "400", style: "normal" },
    { path: "../../public/fonts/inter-600.woff2",          weight: "600", style: "normal" },
    { path: "../../public/fonts/inter-latin-ext-400.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/inter-latin-ext-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: "Foocci",
    template: "%s | Foocci",
  },
  description: "AI CRM para restaurantes — Motor de receita inteligente",
  robots: { index: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
