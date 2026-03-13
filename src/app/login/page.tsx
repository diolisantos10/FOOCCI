/**
 * Login page – Phase 1 placeholder.
 * Full UI implemented in Phase 2 (dashboard shell).
 */

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-bold text-gray-900">
          CRM Restaurante
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          Acesse sua conta para continuar
        </p>

        {/* Auth UI is wired via NextAuth — full form component in Phase 2 */}
        <p className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">
          🚧 Interface de login em construção. Auth API operacional em{" "}
          <code className="font-mono">/api/auth/signin</code>.
        </p>
      </div>
    </main>
  );
}
