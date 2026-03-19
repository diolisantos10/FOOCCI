"use client";

/**
 * First-time setup page.
 *
 * Accessible at /setup. Automatically blocks access once a restaurant exists.
 * Allows a non-technical user to bootstrap the app from the browser.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "checking" | "ready" | "done" | "blocked" | "error";

export default function SetupPage() {
  const router = useRouter();

  const [status, setStatus] = useState<Status>("checking");
  const [form, setForm] = useState({
    restaurantName: "",
    ownerName: "",
    ownerEmail: "",
    ownerPassword: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState("");

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((data) => {
        if (data.setupRequired) {
          setStatus("ready");
        } else {
          setStatus("blocked");
        }
      })
      .catch(() => setStatus("error"));
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setFieldError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const { restaurantName, ownerName, ownerEmail, ownerPassword } = form;
    if (!restaurantName || !ownerName || !ownerEmail || !ownerPassword) {
      setFieldError("All fields are required.");
      return;
    }
    if (ownerPassword.length < 8) {
      setFieldError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    setFieldError("");

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setFieldError(data.error ?? "Setup failed. Please try again.");
        setSubmitting(false);
        return;
      }

      setStatus("done");
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setFieldError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  if (status === "checking") {
    return <Screen><p className="text-gray-500">Verificando banco de dados...</p></Screen>;
  }

  if (status === "error") {
    return (
      <Screen>
        <p className="font-semibold text-red-600">Não foi possível conectar ao banco de dados.</p>
        <p className="mt-1 text-sm text-gray-500">
          Verifique se a variável <code className="font-mono">DATABASE_URL</code> está configurada
          corretamente no Railway.
        </p>
      </Screen>
    );
  }

  if (status === "blocked") {
    return (
      <Screen>
        <p className="font-semibold text-gray-800">Configuração já realizada.</p>
        <p className="mt-1 text-sm text-gray-500">O sistema já foi inicializado.</p>
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
        <p className="mt-3 font-semibold text-gray-800">Configuração concluída!</p>
        <p className="mt-1 text-sm text-gray-500">Redirecionando para o login...</p>
      </Screen>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Configuração inicial</h1>
        <p className="mt-1 text-sm text-gray-500">
          Crie o primeiro restaurante e a conta de administrador.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field
            label="Nome do restaurante"
            name="restaurantName"
            placeholder="Ex: Pizzaria do João"
            value={form.restaurantName}
            onChange={handleChange}
          />
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

          {fieldError && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{fieldError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-lg bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {submitting ? "Criando conta..." : "Criar conta e continuar"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-gray-50 text-center">
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
