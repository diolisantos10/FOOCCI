import type { Metadata } from "next";
import { BottomNav } from "./_components/BottomNav";

export const metadata: Metadata = {
  title: "ANCORD Trainer",
  description: "Treinador pessoal para a prova ANCORD de Assessor de Investimento",
  robots: { index: false },
};

export default function AncordLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-lg px-4 pb-24 pt-5">{children}</div>
      <BottomNav />
    </div>
  );
}
