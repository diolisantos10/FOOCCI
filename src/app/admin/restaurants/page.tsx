"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Owner {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

interface RestaurantRow {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  plan: "STARTER" | "GROWTH" | "PRO";
  createdAt: string;
  owner: Owner | null;
}

interface CreatedCredentials {
  restaurantName: string;
  slug: string;
  ownerEmail: string;
  ownerPassword: string;
  loginUrl: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PLAN_COLORS: Record<string, string> = {
  STARTER: "bg-gray-100 text-gray-600",
  GROWTH:  "bg-blue-100 text-blue-700",
  PRO:     "bg-violet-100 text-violet-700",
};

function planLabel(plan: string) {
  return plan.charAt(0) + plan.slice(1).toLowerCase();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

// ── Secret Gate ───────────────────────────────────────────────────────────────

function SecretGate({ onUnlock }: { onUnlock: (secret: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) { setError("Informe o secret."); return; }
    onUnlock(value.trim());
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 w-full max-w-sm">
        <h1 className="text-white text-xl font-semibold mb-1">Foocci Admin</h1>
        <p className="text-gray-400 text-sm mb-6">Acesso restrito a colaboradores Foocci.</p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password"
            autoFocus
            placeholder="Admin secret"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(""); }}
            className="bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder-gray-500"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            className="bg-violet-600 hover:bg-violet-700 text-white rounded-lg py-2 text-sm font-medium transition-colors"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Credentials Box ───────────────────────────────────────────────────────────

function CredentialsBox({ creds, onClose }: { creds: CreatedCredentials; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(label: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const rows: Array<{ label: string; value: string }> = [
    { label: "Restaurante",  value: creds.restaurantName },
    { label: "Slug",         value: creds.slug },
    { label: "URL de login", value: creds.loginUrl },
    { label: "E-mail owner", value: creds.ownerEmail },
    { label: "Senha temp.",  value: creds.ownerPassword },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-green-700 rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-green-400 text-lg">✓</span>
          <h2 className="text-white font-semibold">Restaurante criado!</h2>
        </div>
        <p className="text-gray-400 text-sm mb-5">
          Guarde as credenciais abaixo. A senha não poderá ser recuperada depois.
        </p>
        <div className="flex flex-col gap-2 mb-6">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 gap-3">
              <div className="min-w-0">
                <p className="text-gray-400 text-xs">{label}</p>
                <p className="text-white text-sm font-mono break-all">{value}</p>
              </div>
              <button
                onClick={() => copy(label, value)}
                className="shrink-0 text-xs text-gray-400 hover:text-white transition-colors"
              >
                {copied === label ? "✓" : "Copiar"}
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-full bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 text-sm font-medium transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

// ── Create Modal ──────────────────────────────────────────────────────────────

interface CreateForm {
  name: string;
  slug: string;
  email: string;
  phone: string;
  address: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
}

const EMPTY_FORM: CreateForm = {
  name: "", slug: "", email: "", phone: "", address: "",
  ownerName: "", ownerEmail: "", ownerPassword: "",
};

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function CreateModal({
  secret,
  onCreated,
  onClose,
}: {
  secret: string;
  onCreated: (creds: CreatedCredentials) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(field: keyof CreateForm, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "name" && !prev.slug) {
        next.slug = slugify(value);
      }
      return next;
    });
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/restaurants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": secret,
        },
        body: JSON.stringify({
          name:          form.name,
          slug:          form.slug,
          email:         form.email || undefined,
          phone:         form.phone || undefined,
          address:       form.address || undefined,
          ownerName:     form.ownerName,
          ownerEmail:    form.ownerEmail,
          ownerPassword: form.ownerPassword,
        }),
      });

      const data = await res.json() as {
        restaurant?: { name: string; slug: string };
        owner?: { email: string };
        error?: string;
        issues?: Record<string, string[]>;
      };

      if (!res.ok) {
        const msg = data.error ?? "Erro ao criar restaurante.";
        const issues = data.issues
          ? Object.values(data.issues).flat().join("; ")
          : "";
        setError(issues ? `${msg}: ${issues}` : msg);
        return;
      }

      const origin = window.location.origin;
      onCreated({
        restaurantName: data.restaurant!.name,
        slug:           data.restaurant!.slug,
        ownerEmail:     data.owner!.email,
        ownerPassword:  form.ownerPassword,
        loginUrl:       `${origin}/login`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  const field = (
    label: string,
    key: keyof CreateForm,
    opts?: { required?: boolean; type?: string; placeholder?: string }
  ) => (
    <div>
      <label className="block text-xs text-gray-400 mb-1">
        {label}{opts?.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type={opts?.type ?? "text"}
        required={opts?.required}
        placeholder={opts?.placeholder}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        autoComplete="off"
        className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder-gray-500"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-lg my-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold">Novo restaurante</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Restaurante</p>

          {field("Nome", "name", { required: true, placeholder: "Pizzaria do João" })}
          {field("Slug", "slug", { required: true, placeholder: "pizzaria-do-joao" })}

          <div className="grid grid-cols-2 gap-3">
            {field("E-mail", "email", { type: "email", placeholder: "contato@restaurante.com" })}
            {field("Telefone", "phone", { placeholder: "+55 11 99999-9999" })}
          </div>

          {field("Endereço", "address", { placeholder: "Rua das Flores, 123 — SP" })}

          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mt-1">Owner</p>

          {field("Nome do owner", "ownerName", { required: true, placeholder: "João Silva" })}

          <div className="grid grid-cols-2 gap-3">
            {field("E-mail do owner", "ownerEmail", { required: true, type: "email", placeholder: "joao@restaurante.com" })}
            {field("Senha temporária", "ownerPassword", { required: true, type: "password", placeholder: "mín. 8 caracteres" })}
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg py-2 text-sm font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors"
            >
              {loading ? "Criando…" : "Criar restaurante"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminRestaurantsPage() {
  const [secret, setSecret] = useState<string | null>(null);
  const [rows, setRows] = useState<RestaurantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchList = useCallback(async (s: string) => {
    setLoading(true);
    setFetchError("");
    try {
      const res = await fetch("/api/admin/restaurants", {
        headers: { "x-admin-secret": s },
      });
      if (res.status === 401 || res.status === 403) {
        setSecret(null);
        setFetchError("Secret inválido.");
        return;
      }
      const data = await res.json() as { data?: RestaurantRow[]; error?: string };
      if (!res.ok) { setFetchError(data.error ?? "Erro ao carregar."); return; }
      setRows(data.data ?? []);
    } catch {
      setFetchError("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (secret) fetchList(secret);
  }, [secret, fetchList]);

  async function toggleActive(id: string, current: boolean) {
    if (!secret) return;
    setToggling(id);
    try {
      const res = await fetch(`/api/admin/restaurants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ isActive: !current }),
      });
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) => (r.id === id ? { ...r, isActive: !current } : r))
        );
      }
    } finally {
      setToggling(null);
    }
  }

  function handleCreated(creds: CreatedCredentials) {
    setShowCreate(false);
    setCredentials(creds);
    if (secret) fetchList(secret);
  }

  if (!secret) {
    return <SecretGate onUnlock={setSecret} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Foocci Admin</h1>
          <p className="text-gray-400 text-sm">Gerenciamento de restaurantes</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Novo restaurante
        </button>
      </div>

      {/* Content */}
      <div className="p-6">
        {fetchError && (
          <div className="bg-red-950/40 border border-red-900 text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">
            {fetchError}
          </div>
        )}

        {loading ? (
          <p className="text-gray-500 text-sm">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhum restaurante cadastrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800">
                  <th className="pb-3 pr-4 font-medium">Restaurante</th>
                  <th className="pb-3 pr-4 font-medium">Slug</th>
                  <th className="pb-3 pr-4 font-medium">Owner</th>
                  <th className="pb-3 pr-4 font-medium">Plano</th>
                  <th className="pb-3 pr-4 font-medium">Criado</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-3 pr-4">
                      <p className="text-white font-medium">{r.name}</p>
                      {r.email && <p className="text-gray-500 text-xs">{r.email}</p>}
                    </td>
                    <td className="py-3 pr-4 text-gray-400 font-mono text-xs">{r.slug}</td>
                    <td className="py-3 pr-4">
                      {r.owner ? (
                        <>
                          <p className="text-gray-300">{r.owner.name}</p>
                          <p className="text-gray-500 text-xs">{r.owner.email}</p>
                        </>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PLAN_COLORS[r.plan]}`}>
                        {planLabel(r.plan)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-gray-400 text-xs">{fmtDate(r.createdAt)}</td>
                    <td className="py-3">
                      <button
                        onClick={() => toggleActive(r.id, r.isActive)}
                        disabled={toggling === r.id}
                        className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                          r.isActive
                            ? "bg-green-900/60 text-green-400 hover:bg-red-900/60 hover:text-red-400"
                            : "bg-gray-800 text-gray-500 hover:bg-green-900/60 hover:text-green-400"
                        } disabled:opacity-50`}
                      >
                        {toggling === r.id ? "…" : r.isActive ? "Ativo" : "Inativo"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && secret && (
        <CreateModal
          secret={secret}
          onCreated={handleCreated}
          onClose={() => setShowCreate(false)}
        />
      )}

      {credentials && (
        <CredentialsBox
          creds={credentials}
          onClose={() => setCredentials(null)}
        />
      )}
    </div>
  );
}
