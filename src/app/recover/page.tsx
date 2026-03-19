"use client";

/**
 * /recover — Owner account recovery page.
 *
 * Only accessible when a restaurant exists but has no active OWNER.
 * Blocked immediately if a valid owner already exists.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "checking" | "allowed" | "blocked" | "done" | "db_error";

export default function RecoverPage() {
  const router = useRouter();

  const [status, setStatus] = useState<Status>("checking");
  const [restaurantName, setRestaurantName] = useState("");
  const [form, setForm] = useState({ ownerName: "", ownerEmail: "", ownerPassword: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/recover")
      .then((r) => r.json())
      .then((data) => {
        if (data.recoveryAllowed) {
          setRestaurantName(data.restaurantName ?? "");
          setStatus("allowed");
        } else if (data.reason === "no_restaurant") {
          setStatus("blocked");
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
        <p className="font-semibold text-gray-800">Recuperação não disponível.</p>
        <p className="mt-2 text-sm text-gray-500">
          Uma conta de proprietário ativa já existe. Use o fluxo normal de login.
        </p>
        <a
          href="/login"
          className="mt-4 inline-block rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-600"
        >
          Ir para o Login
        </a>
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
          <Field
            label="Seu nome"
            name="ownerName"
            placeholder="Ex: João Silva"
            value={form.ownerName}
            onChange={handleChange}
          />
          <Field
            label="E-mail de acesso"
            name="ownerEmail"
            type="email"
            placeholder="Ex: joao@pizzaria.com"
            value={form.ownerEmail}
            onChange={handleChange}
          />
          <Field
            label="Senha (mínimo 8 caracteres)"
            name="ownerPassword"
            type="password"
            placeholder="••••••••"
            value={form.ownerPassword}
            onChange={handleChange}
          />

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
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

function Field({
  label,
  name,
  type = "text",
  placeholder,
  value,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
      />
    </div>
  );
}
