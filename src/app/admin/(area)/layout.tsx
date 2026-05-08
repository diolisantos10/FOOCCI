/**
 * Admin area layout — server component.
 * Checks the admin session cookie on every request.
 * Renders the admin sidebar + main content area.
 */

import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { AdminSidebar } from "./AdminSidebar";

export default function AdminAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isAdminAuthenticated()) {
    redirect("/admin/login");
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
