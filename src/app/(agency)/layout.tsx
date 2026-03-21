import { AgencySidebar } from "@/components/agency/layout/AgencySidebar";

export const metadata = {
  title: {
    default: "Dioli Agency OS",
    template: "%s | Agency OS",
  },
};

export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "#F8F8F7" }}>
      <AgencySidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
