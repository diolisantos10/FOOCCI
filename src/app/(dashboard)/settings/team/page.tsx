"use client";

import { useState, useEffect, type FormEvent } from "react";
import { apiFetch, Field, INPUT, SELECT, Feedback, PageCard, SectionHeading } from "../_shared";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
};

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Proprietário",
  MANAGER: "Gerente",
  STAFF: "Funcionário",
};

const ROLE_COLORS: Record<string, string> = {
  OWNER:   "bg-violet-100 text-violet-700",
  MANAGER: "bg-indigo-100 text-indigo-700",
  STAFF:   "bg-[#F4F4F2] text-ink2",
};

const ROLE_ICONS: Record<string, string> = {
  OWNER: "👑",
  MANAGER: "🎯",
  STAFF: "👤",
};

export default function TeamPage() {
  const [users, setUsers]       = useState<UserRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding]     = useState(false);
  const [success, setSuccess]   = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [newUser, setNewUser]   = useState({
    name: "",
    email: "",
    password: "",
    role: "STAFF",
  });

  useEffect(() => {
    apiFetch("/api/users").then(({ data }) => {
      if (Array.isArray(data)) setUsers(data);
      setLoading(false);
    });
  }, []);

  function setField(key: keyof typeof newUser) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setNewUser((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    setSuccess(null);
    const { ok, data } = await apiFetch("/api/users", "POST", newUser);
    if (ok) {
      setUsers((prev) => [...prev, data as UserRow]);
      setNewUser({ name: "", email: "", password: "", role: "STAFF" });
      setShowForm(false);
      setSuccess("Usuário criado com sucesso.");
    } else {
      setError(data?.error ?? "Erro ao criar usuário.");
    }
    setAdding(false);
  }

  if (loading) return <p className="py-8 text-sm text-muted">Carregando…</p>;

  return (
    <div className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      {/* User list */}
      <PageCard>
        <SectionHeading
          title="Membros da equipe"
          subtitle={`${users.length} usuário${users.length !== 1 ? "s" : ""} cadastrado${users.length !== 1 ? "s" : ""}.`}
        />

        {users.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            Nenhum usuário cadastrado ainda.
          </p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className={`flex items-center gap-3 rounded-xl border border-line px-4 py-3 ${
                  !u.isActive ? "opacity-50" : ""
                }`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F4F4F2] text-lg">
                  {ROLE_ICONS[u.role] ?? "👤"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink">{u.name}</p>
                  <p className="text-xs text-muted truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      ROLE_COLORS[u.role] ?? "bg-[#F4F4F2] text-ink2"
                    }`}
                  >
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                  {!u.isActive && (
                    <span className="rounded-full bg-[#F4F4F2] px-2 py-0.5 text-[10px] font-medium text-muted">
                      Inativo
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </PageCard>

      {/* Add user form */}
      {showForm ? (
        <PageCard>
          <SectionHeading title="Novo usuário" />
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome completo">
                <input
                  className={INPUT}
                  value={newUser.name}
                  onChange={setField("name")}
                  placeholder="João Silva"
                  required
                  maxLength={100}
                />
              </Field>
              <Field label="E-mail">
                <input
                  className={INPUT}
                  type="email"
                  value={newUser.email}
                  onChange={setField("email")}
                  placeholder="joao@email.com"
                  required
                />
              </Field>
              <Field label="Senha" hint="Mínimo 6 caracteres.">
                <input
                  className={INPUT}
                  type="password"
                  value={newUser.password}
                  onChange={setField("password")}
                  required
                  minLength={6}
                />
              </Field>
              <Field label="Perfil">
                <select
                  className={SELECT}
                  value={newUser.role}
                  onChange={setField("role")}
                >
                  <option value="STAFF">Funcionário — acesso básico</option>
                  <option value="MANAGER">Gerente — acesso à operação</option>
                  <option value="OWNER">Proprietário — acesso total</option>
                </select>
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-xl border border-line2 px-4 py-2 text-sm text-ink2 hover:bg-[#FAFAF8]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={adding}
                className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition"
              >
                {adding ? "Criando…" : "Criar usuário"}
              </button>
            </div>
          </form>
        </PageCard>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line2 py-4 text-sm font-medium text-muted hover:border-brand-300 hover:text-brand-600 transition"
        >
          + Adicionar membro
        </button>
      )}
    </div>
  );
}
