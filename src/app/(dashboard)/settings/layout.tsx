import { TopBar } from "@/components/layout/TopBar";
import SettingsNav from "./SettingsNav";

export const metadata = { title: "Configurações — Foocci" };

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <TopBar title="Centro de Controle" />

      {/* Body: sidebar + content */}
      <div className="flex flex-1 min-h-0">
        <SettingsNav />

        {/* Content area */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="mx-auto max-w-2xl px-6 py-6 pb-12">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
