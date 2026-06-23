import type { Metadata, Viewport } from "next";
import { BottomNav } from "./_components/BottomNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "ANCORD Trainer",
  description:
    "Treinador pessoal para a prova ANCORD de Assessor de Investimento. Questões, flashcards e simulados no formato real.",
  applicationName: "ANCORD Trainer",
  robots: { index: false },
};

export const viewport: Viewport = {
  themeColor: "#f97316",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased overflow-x-hidden">
        <div className="min-h-screen bg-gray-50 text-gray-900">
          <div className="mx-auto max-w-lg px-4 pb-24 pt-5">{children}</div>
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
