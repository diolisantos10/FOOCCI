"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";

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

interface SuccessInfo {
  restaurantName: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  loginUrl: string;
  deliveryUrl: string;
  qrUrl: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PLAN_COLORS: Record<string, string> = {
  STARTER: "bg-gray-700 text-gray-300",
  GROWTH:  "bg-blue-900/60 text-blue-300",
  PRO:     "bg-violet-900/60 text-violet-300",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function generatePassword(len = 12) {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$";
  let pw = "";
  for (let i = 0; i < len; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyBtn({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="Copiar"
      className={`shrink-0 text-xs transition-colors ${copied ? "text-green-400" : "text-gray-500 hover:text-gray-300"} ${className}`}
    >
      {copied ? "✓" : "📋"}
    </button>
  );
}

// ── SuccessPanel ──────────────────────────────────────────────────────────────

function SuccessPanel({ info, onClose }: { info: SuccessInfo; onClose: () => void }) {
  const rows = [
    { label: "Restaurante",         value: info.restaurantName },
    { label: "Slug",                value: info.slug },
    { label: "Owner",               value: info.ownerName },
    { label: "E-mail de login",     value: info.ownerEmail },
    { label: "Senha temporária",    value: info.ownerPassword },
    { label: "Painel admin",        value: info.loginUrl },
    { label: "Cardápio delivery",   value: info.deliveryUrl },
    { label: "Cardápio QR / Salão", value: info.qrUrl },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-900 border border-green-800 rounded-2xl p-6 w-full max-w-lg my-4">
        <div className="flex items-center gap-3 mb-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-900/50 text-green-400 text-lg">✓</span>
          <div>
            <h2 className="text-white font-semibold">Restaurante criado com sucesso!</h2>
            <p className="text-gray-400 text-xs">Guarde as credenciais abaixo.</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between gap-3 bg-gray-800 rounded-xl px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
                <p className="text-sm text-white font-mono break-all mt-0.5">{value}</p>
              </div>
              <CopyBtn text={value} />
            </div>
          ))}
        </div>

        <div className="mt-5 flex gap-3">
          <a
            href={info.deliveryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl py-2 text-sm font-medium transition-colors"
          >
            Ver cardápio
          </a>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-xl py-2 text-sm font-medium transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CreateModal ───────────────────────────────────────────────────────────────

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

function CreateModal({
  onCreated,
  onClose,
}: {
  onCreated: (info: SuccessInfo) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CreateForm>({ ...EMPTY_FORM });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(field: keyof CreateForm, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Auto-generate slug from name while user hasn't manually edited it
      if (field === "name") next.slug = slugify(value);
      return next;
    });
    setError("");
  }

  function setSlug(value: string) {
    setForm((prev) => ({ ...prev, slug: slugify(value) }));
    setError("");
  }

  function genPassword() {
    setForm((prev) => ({ ...prev, ownerPassword: generatePassword() }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim() || !form.ownerName.trim() || !form.ownerEmail.trim() || !form.ownerPassword) {
      setError("Preencha todos os campos obrigatórios.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/restaurants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:          form.name.trim(),
          slug:          form.slug.trim(),
          email:         form.email.trim() || undefined,
          phone:         form.phone.trim() || undefined,
          address:       form.address.trim() || undefined,
          ownerName:     form.ownerName.trim(),
          ownerEmail:    form.ownerEmail.trim(),
          ownerPassword: form.ownerPassword,
        }),
      });
      const data = await res.json() as {
        restaurant?: { name: string; slug: string };
        owner?: { email: string; name?: string };
        error?: string;
        issues?: Record<string, string[]>;
      };
      if (!res.ok) {
        const issues = data.issues ? Object.values(data.issues).flat().join("; ") : "";
        setError(issues ? `${data.error ?? "Erro"}: ${issues}` : (data.error ?? "Erro ao criar restaurante."));
        return;
      }
      const origin = window.location.origin;
      const slug = data.restaurant!.slug;
      onCreated({
        restaurantName: data.restaurant!.name,
        slug,
        ownerName:    form.ownerName.trim(),
        ownerEmail:   data.owner!.email,
        ownerPassword: form.ownerPassword,
        loginUrl:     `${origin}/login`,
        deliveryUrl:  `${origin}/pedido/${slug}`,
        qrUrl:        `${origin}/qr/${slug}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  const inp = (
    label: string,
    key: keyof CreateForm,
    opts?: { required?: boolean; type?: string; placeholder?: string; onChange?: (v: string) => void }
  ) => (
    <div>
      <label className="block text-xs text-gray-400 mb-1">
        {label}{opts?.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type={opts?.type ?? "text"}
        autoComplete="off"
        value={form[key]}
        onChange={(e) => opts?.onChange ? opts.onChange(e.target.value) : set(key, e.target.value)}
        placeholder={opts?.placeholder}
        className="w-full bg-gray-800 text-white border border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder-gray-600"
      />
    </div>
  );

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg my-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold text-lg">Novo restaurante</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none transition-colors">✕</button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {/* Section A — Restaurant */}
          <div className="rounded-xl border border-gray-800 p-4 flex flex-col gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              Dados do restaurante
            </p>

            {inp("Nome do restaurante", "name", { required: true, placeholder: "Pizzaria do João" })}

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Slug <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                autoComplete="off"
                value={form.slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="pizzaria-do-joao"
                className="w-full bg-gray-800 text-white border border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder-gray-600 font-mono"
              />
              {form.slug && (
                <div className="mt-1.5 space-y-0.5">
                  <p className="text-[11px] text-gray-500">
                    🛵 Delivery: <span className="text-gray-400 font-mono">{origin}/pedido/{form.slug}</span>
                  </p>
                  <p className="text-[11px] text-gray-500">
                    📱 QR Salão: <span className="text-gray-400 font-mono">{origin}/qr/{form.slug}</span>
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {inp("E-mail", "email", { type: "email", placeholder: "contato@restaurante.com" })}
              {inp("Telefone / WhatsApp", "phone", { placeholder: "11 99999-9999" })}
            </div>
          </div>

          {/* Section B — Owner */}
          <div className="rounded-xl border border-gray-800 p-4 flex flex-col gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              Login do dono / responsável
            </p>

            {inp("Nome completo", "ownerName", { required: true, placeholder: "João Silva" })}

            {inp("E-mail de login", "ownerEmail", { required: true, type: "email", placeholder: "joao@restaurante.com" })}

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Senha temporária <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  autoComplete="new-password"
                  value={form.ownerPassword}
                  onChange={(e) => set("ownerPassword", e.target.value)}
                  placeholder="mín. 8 caracteres"
                  className="flex-1 bg-gray-800 text-white border border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder-gray-600 font-mono"
                />
                <button
                  type="button"
                  onClick={genPassword}
                  className="shrink-0 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap"
                >
                  Gerar
                </button>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-950/40 border border-red-900/60 rounded-xl px-3 py-2.5">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl py-2.5 text-sm font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
            >
              {loading ? "Criando…" : "Criar restaurante"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── EditModal ─────────────────────────────────────────────────────────────────

function EditModal({
  row,
  onSaved,
  onClose,
}: {
  row: RestaurantRow;
  onSaved: (updated: Partial<RestaurantRow>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [plan, setPlan] = useState<RestaurantRow["plan"]>(row.plan);
  const [isActive, setIsActive] = useState(row.isActive);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function save(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/restaurants/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined, plan, isActive }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "Erro ao salvar."); return; }
      onSaved({ name: name.trim() || row.name, plan, isActive });
      onClose();
    } catch {
      setError("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold">Editar restaurante</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
        </div>
        <form onSubmit={save} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-800 text-white border border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Plano</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as RestaurantRow["plan"])}
              className="w-full bg-gray-800 text-white border border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="STARTER">Starter</option>
              <option value="GROWTH">Growth</option>
              <option value="PRO">Pro</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsActive((v) => !v)}
              className={`relative h-5 w-9 rounded-full transition-colors ${isActive ? "bg-green-600" : "bg-gray-700"}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isActive ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
            <span className="text-sm text-gray-300">{isActive ? "Ativo" : "Inativo"}</span>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl py-2 text-sm font-semibold transition-colors">Cancelar</button>
            <button type="submit" disabled={loading} className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl py-2 text-sm font-semibold transition-colors">
              {loading ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── LinksPopover ──────────────────────────────────────────────────────────────

function LinksPopover({ row, onClose }: { row: RestaurantRow; onClose: () => void }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const links = [
    { label: "Painel admin",        value: `${origin}/login`, note: `slug: ${row.slug}` },
    { label: "Cardápio delivery",   value: `${origin}/pedido/${row.slug}` },
    { label: "Cardápio QR / Salão", value: `${origin}/qr/${row.slug}` },
  ];
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-sm">{row.name} — Links</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
        </div>
        <div className="flex flex-col gap-2">
          {links.map(({ label, value, note }) => (
            <div key={label} className="flex items-center justify-between gap-3 bg-gray-800 rounded-xl px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
                <p className="text-xs text-gray-300 font-mono break-all mt-0.5">{value}</p>
                {note && <p className="text-[10px] text-gray-500 mt-0.5">{note}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <CopyBtn text={value} />
                <a href={value} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-gray-300 transition-colors" title="Abrir">↗</a>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={onClose} className="w-full mt-4 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl py-2 text-sm font-medium transition-colors">
          Fechar
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminRestaurantsPage() {
  const [rows, setRows] = useState<RestaurantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [showCreate, setShowCreate]   = useState(false);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);
  const [editRow, setEditRow]         = useState<RestaurantRow | null>(null);
  const [linksRow, setLinksRow]       = useState<RestaurantRow | null>(null);
  const [toggling, setToggling]       = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    try {
      const res = await fetch("/api/admin/restaurants");
      if (res.status === 401 || res.status === 403) {
        setFetchError("Sessão expirada. Faça login novamente.");
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

  useEffect(() => { fetchList(); }, [fetchList]);

  const filtered = rows.filter((r) => {
    const q = query.toLowerCase();
    if (statusFilter === "active"   && !r.isActive) return false;
    if (statusFilter === "inactive" && r.isActive)  return false;
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      r.slug.toLowerCase().includes(q) ||
      (r.owner?.email ?? "").toLowerCase().includes(q) ||
      (r.owner?.name  ?? "").toLowerCase().includes(q)
    );
  });

  async function toggleActive(r: RestaurantRow) {
    setToggling(r.id);
    try {
      const res = await fetch(`/api/admin/restaurants/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !r.isActive }),
      });
      if (res.ok) {
        setRows((prev) => prev.map((x) => x.id === r.id ? { ...x, isActive: !r.isActive } : x));
      }
    } finally {
      setToggling(null);
    }
  }

  function handleCreated(info: SuccessInfo) {
    setShowCreate(false);
    setSuccessInfo(info);
    fetchList();
  }

  function handleEdited(id: string, patch: Partial<RestaurantRow>) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white">Restaurantes</h1>
          <p className="text-gray-400 text-sm">{rows.length} restaurante{rows.length !== 1 ? "s" : ""} cadastrado{rows.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="shrink-0 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
        >
          + Novo restaurante
        </button>
      </div>

      {/* Filters */}
      <div className="border-b border-gray-800 px-6 py-3 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome, slug, e-mail…"
          className="flex-1 min-w-48 bg-gray-800 text-white border border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder-gray-600"
        />
        <div className="flex gap-1">
          {(["all", "active", "inactive"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-violet-700 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {s === "all" ? "Todos" : s === "active" ? "Ativos" : "Inativos"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {fetchError && (
          <div className="bg-red-950/40 border border-red-900/60 text-red-400 rounded-xl px-4 py-3 mb-5 text-sm flex items-center gap-2">
            <span>⚠</span> {fetchError}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm pt-4">
            <span className="animate-spin h-4 w-4 border-2 border-gray-600 border-t-violet-400 rounded-full inline-block" />
            Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 text-sm">
              {query || statusFilter !== "all"
                ? "Nenhum resultado para os filtros aplicados."
                : "Nenhum restaurante cadastrado. Crie o primeiro!"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Restaurante</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Slug</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Owner</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Plano</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Criado</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{r.name}</p>
                      {r.email && <p className="text-gray-500 text-xs mt-0.5">{r.email}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400 font-mono text-xs">{r.slug}</span>
                        <CopyBtn text={r.slug} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {r.owner ? (
                        <>
                          <p className="text-gray-200 text-sm">{r.owner.name}</p>
                          <p className="text-gray-500 text-xs">{r.owner.email}</p>
                        </>
                      ) : (
                        <span className="text-gray-600 text-xs italic">Sem owner</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PLAN_COLORS[r.plan]}`}>
                        {r.plan.charAt(0) + r.plan.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(r.createdAt)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(r)}
                        disabled={toggling === r.id}
                        className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors disabled:opacity-50 ${
                          r.isActive
                            ? "bg-green-900/50 text-green-400 hover:bg-red-900/40 hover:text-red-400"
                            : "bg-gray-800 text-gray-500 hover:bg-green-900/40 hover:text-green-400"
                        }`}
                      >
                        {toggling === r.id ? "…" : r.isActive ? "Ativo" : "Inativo"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          title="Editar"
                          onClick={() => setEditRow(r)}
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-700 hover:text-gray-300 transition-colors text-xs"
                        >
                          ✎
                        </button>
                        <button
                          title="Ver links públicos"
                          onClick={() => setLinksRow(r)}
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-700 hover:text-gray-300 transition-colors text-xs"
                        >
                          🔗
                        </button>
                        <a
                          href={`${origin}/pedido/${r.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir cardápio delivery"
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-700 hover:text-gray-300 transition-colors text-xs"
                        >
                          ↗
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateModal onCreated={handleCreated} onClose={() => setShowCreate(false)} />
      )}
      {successInfo && (
        <SuccessPanel info={successInfo} onClose={() => setSuccessInfo(null)} />
      )}
      {editRow && (
        <EditModal
          row={editRow}
          onSaved={(patch) => handleEdited(editRow.id, patch)}
          onClose={() => setEditRow(null)}
        />
      )}
      {linksRow && (
        <LinksPopover row={linksRow} onClose={() => setLinksRow(null)} />
      )}
    </div>
  );
}
