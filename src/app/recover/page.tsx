"use client";

/**
 * /recover — Owner account recovery page.
 *
 * Normal mode (/recover):
 *   Only shows the form when restaurant exists but no active OWNER.
 *   Blocked immediately if a valid owner already exists.
 *
 * Force mode (/recover?force=true):
 *   Deletes ALL user accounts for the restaurant (keeps all other data),
 *   then redirects to /recover so a new owner can be created.
 *   Requires the user to type "CONFIRMAR" before proceeding.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

type Status = "checking" | "allowed" | "blocked" | "done" | "db_error";

function RecoverForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceMode = searchParams.get("force") === "true";

  const [status, setStatus] = useState<Status>("checking");
  const [restaurantName, setRestaurantName] = useState("");
  const [form, setForm] = useState({ ownerName: "", ownerEmail: "", ownerPassword: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Force-reset state
  const [confirmText, setConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");

  useEffect(() => {
    fetch("/api/recover")
      .then((r) => r.json())
      .then((data) => {
        setRestaurantName(data.restaurantName ?? "");
        if (data.recoveryAllowed) {
          setStatus("allowed");
        } else {
          setStatus("blocked");
        }
      })
      .catch(() => setStatus("db_error"));
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const { ownerName, ownerEmail, ownerPassword } = form;
    if (!ownerName || !ownerEmail || !ownerPassword) {
      setError("Todos os campos são obrigatórios.");
      return;
    }
    if (ownerPassword.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erro ao criar a conta. Tente novamente.");
        setSubmitting(false);
        return;
      }

      setStatus("done");
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setSubmitting(false);
    }
  }

  async function handleForceReset() {
    if (confirmText !== "CONFIRMAR") {
      setResetError('Digite exatamente "CONFIRMAR" para prosseguir.');
      return;
    }
    setResetting(true);
    setResetError("");

    try {
      const res = await fetch("/api/admin/reset-owner", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setResetError(data.error ?? "Erro ao resetar. Tente novamente.");
        setResetting(false);
        return;
      }

      // Reset complete — go to normal recover to create new owner
      router.push("/recover");
      router.refresh();
    } catch {
      setResetError("Erro de conexão. Tente novamente.");
      setResetting(false);
    }
  }

  // ─── Force-reset UI ──────────────────────────────────────────────────────────
  if (forceMode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-2xl">⚠️</span>
            <h1 className="text-xl font-bold text-red-700">Resetar acesso de proprietário</h1>
          </div>

          {restaurantName && (
            <p className="text-sm text-gray-600">
              Restaurante: <span className="font-semibold">{restaurantName}</span>
            </p>
          )}

          <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">O que será apagado:</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>Todas as contas de usuário deste restaurante</li>
            </ul>
            <p className="mt-2 font-semibold">O que será mantido:</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>Dados do restaurante</li>
              <li>Cardápio e categorias</li>
              <li>Pedidos e conversas</li>
              <li>Configurações</li>
            </ul>
          </div>

          <div className="mt-5">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Digite <strong>CONFIRMAR</strong> para prosseguir
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => { setConfirmText(e.target.value); setResetError(""); }}
              placeholder="CONFIRMAR"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
            />
          </div>

          {resetError && (
            <p className="mt-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{resetError}</p>
          )}

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => router.push("/recover")}
              className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleForceReset}
              disabled={resetting || confirmText !== "CONFIRMAR"}
              className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {resetting ? "Resetando..." : "Resetar usuários"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Normal recovery UI ──────────────────────────────────────────────────────
  if (status === "checking") {
    return <Screen><p className="text-gray-500">Verificando estado do sistema...</p></Screen>;
  }

  if (status === "db_error") {
    return (
      <Screen>
        <p className="font-semibold text-red-600">Não foi possível conectar ao banco de dados.</p>
        <p className="mt-1 text-sm text-gray-500">
          Verifique se <code className="font-mono">DATABASE_URL</code> está configurado no Railway.
        </p>
      </Screen>
    );
  }

  if (status === "blocked") {
    return (
      <Screen>
        <p className="font-semibold text-gray-800">Uma conta de proprietário ativa já existe.</p>
        <p className="mt-1 text-sm text-gray-500">
          Use o login normal. Se suas credenciais não funcionam, use a recuperação forçada.
        </p>
        <div className="mt-4 flex flex-col items-center gap-2">
          <a
            href="/login"
            className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-600"
          >
            Ir para o Login
          </a>
          <a
            href="/recover?force=true"
            className="text-sm text-red-500 underline hover:text-red-700"
          >
            Recuperação forçada (apaga todos os usuários)
          </a>
        </div>
      </Screen>
    );
  }

  if (status === "done") {
    return (
      <Screen>
        <div className="text-4xl">✅</div>
        <p className="mt-3 font-semibold text-gray-800">Conta criada com sucesso!</p>
        <p className="mt-1 text-sm text-gray-500">Redirecionando para o login...</p>
      </Screen>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Recuperação de acesso</h1>
        {restaurantName && (
          <p className="mt-1 text-sm text-gray-500">
            Restaurante: <span className="font-medium text-gray-700">{restaurantName}</span>
          </p>
        )}
        <p className="mt-1 text-sm text-orange-600">
          Nenhum proprietário ativo encontrado. Crie uma conta de acesso agora.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field label="Seu nome" name="ownerName" placeholder="Ex: João Silva"
            value={form.ownerName} onChange={handleChange} />
          <Field label="E-mail de acesso" name="ownerEmail" type="email"
            placeholder="Ex: joao@pizzaria.com" value={form.ownerEmail} onChange={handleChange} />
          <Field label="Senha (mínimo 8 caracteres)" name="ownerPassword" type="password"
            placeholder="••••••••" value={form.ownerPassword} onChange={handleChange} />

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
          )}

          <button type="submit" disabled={submitting}
            className="mt-2 w-full rounded-lg bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {submitting ? "Criando conta..." : "Criar conta de proprietário"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-gray-50 px-4 text-center">
      {children}
    </div>
  );
}

function Field({ label, name, type = "text", placeholder, value, onChange }: {
  label: string; name: string; type?: string; placeholder?: string;
  value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <input id={name} name={name} type={type} placeholder={placeholder} value={value}
        onChange={onChange}
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
      />
    </div>
  );
}

export default function RecoverPage() {
  return (
    <Suspense>
      <RecoverForm />
    </Suspense>
  );
}
