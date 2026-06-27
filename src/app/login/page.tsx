"use client";

/**
 * Login page.
 *
 * Branded sign-in for restaurant owners — linked from the marketing site.
 * Left: brand panel (mascot + value props). Right: the form.
 *
 * Collects email + password. Resolves the restaurant slug transparently
 * via /api/auth/lookup before calling NextAuth signIn — the user never
 * needs to know about the slug.
 */

import { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import { signIn, getProviders } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

const VALUE_PROPS = [
  "Atendimento que vende sozinho, 24h por dia",
  "Pedidos, CRM e campanhas num só lugar",
  "Cada conversa vira receita",
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  // Only show the Google button when the server actually has it configured.
  useEffect(() => {
    getProviders()
      .then((p) => setGoogleEnabled(Boolean(p?.google)))
      .catch(() => setGoogleEnabled(false));
  }, []);

  // Surface a Google sign-in rejection (e.g. email not provisioned / ambiguous).
  useEffect(() => {
    if (searchParams.get("error")) {
      setError("Não foi possível entrar com o Google. Use seu e-mail e senha, ou fale com o suporte.");
    }
  }, [searchParams]);

  function handleGoogle() {
    const callbackUrl = searchParams.get("callbackUrl");
    const destination = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/dashboard";
    void signIn("google", { callbackUrl: destination });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError("");
    setLoading(true);

    try {
      // Step 1: resolve restaurant slug from email
      const lookupRes = await fetch("/api/auth/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      if (!lookupRes.ok) {
        setError("E-mail ou senha incorretos.");
        setLoading(false);
        return;
      }

      const { slug } = await lookupRes.json();

      // Step 2: authenticate with NextAuth
      const result = await signIn("credentials", {
        redirect: false,
        email: email.trim().toLowerCase(),
        password,
        restaurantSlug: slug,
      });

      if (!result || result.error) {
        setError("E-mail ou senha incorretos.");
        setLoading(false);
        return;
      }

      // Step 3: redirect
      const callbackUrl = searchParams.get("callbackUrl");
      const destination =
        callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/dashboard";
      router.push(destination);
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-white">
      {/* ── Brand panel (desktop only) ─────────────────────────────── */}
      <aside className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-brand-500 to-brand-600 lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* soft glow accents */}
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-black/10 blur-3xl" />

        <Image
          src="/brand/foocci/foocci-wordmark.png"
          alt="Foocci"
          width={200}
          height={50}
          priority
          className="relative h-7 w-auto brightness-0 invert"
        />

        <div className="relative">
          <Image
            src="/brand/foocci/foocci-mascot-cutout.png"
            alt=""
            aria-hidden
            width={320}
            height={520}
            className="mb-8 h-44 w-auto drop-shadow-xl"
          />
          <h2 className="max-w-sm text-3xl font-bold leading-tight tracking-tight text-white">
            O motor de receita do seu restaurante.
          </h2>
          <ul className="mt-7 space-y-3">
            {VALUE_PROPS.map((v) => (
              <li key={v} className="flex items-start gap-2.5 text-[15px] text-white/90">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="mt-0.5 shrink-0" aria-hidden>
                  <path d="M16.5 5.5 8.25 14 4 9.75" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {v}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/70">Foocci · IA CRM para restaurantes</p>
      </aside>

      {/* ── Form panel ─────────────────────────────────────────────── */}
      <main className="flex w-full items-center justify-center px-5 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          {/* Brand lockup — shown on mobile (the panel is hidden there) */}
          <div className="mb-8 flex flex-col items-center lg:hidden">
            <span className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-50 ring-1 ring-gray-900/[0.03]">
              <Image src="/brand/foocci/foocci-mascot.png" alt="" aria-hidden width={196} height={321} className="h-16 w-auto" />
            </span>
            <Image src="/brand/foocci/foocci-wordmark.png" alt="Foocci" width={200} height={50} priority className="h-7 w-auto" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-[#0B0B0B]">Entrar</h1>
          <p className="mt-1.5 text-sm text-gray-500">Acesse o painel do seu restaurante.</p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
                Senha
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>

          {googleEnabled && (
            <>
              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-400">ou</span>
                <span className="h-px flex-1 bg-gray-200" />
              </div>
              <button
                type="button"
                onClick={handleGoogle}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-white py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
                  <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
                  <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
                  <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
                </svg>
                Entrar com Google
              </button>
            </>
          )}

          <div className="mt-6 text-center">
            <a href="/recover" className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline">
              Esqueci minha senha
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

// useSearchParams requires Suspense boundary in Next.js 14
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
