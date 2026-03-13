/**
 * Dashboard root – Phase 1 placeholder.
 * Full dashboard shell implemented in Phase 2.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          Bem-vindo, {session.user.name} 👋
        </h1>
        <p className="text-sm text-gray-500">
          Restaurant ID:{" "}
          <code className="font-mono text-xs">{session.user.restaurantId}</code>
        </p>
        <p className="mt-1 text-sm text-gray-500">
          Role: <span className="font-medium">{session.user.role}</span>
        </p>
        <p className="mt-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">
          🚧 Dashboard em construção. Fase 2 implementa o shell completo.
        </p>
      </div>
    </main>
  );
}
