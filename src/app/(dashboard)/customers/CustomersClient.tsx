"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NewCustomerButton } from "./NewCustomerButton";
import { isGuestIdentifier } from "@/lib/guest";

export type SortCol = "totalSpend" | "totalOrders" | "lastOrderAt";
export type SortDir = "asc" | "desc";
export type FilterTab = "all" | "vip" | "inactive" | "quente" | "morno" | "frio" | "neverOrdered" | "firstTime" | "recent";

export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  totalOrders: number;
  totalSpend: number;
  lastOrderAt: string | null;
};

interface Props {
  customers: CustomerRow[];
  total: number;
  page: number;
  totalPages: number;
  search: string | undefined;
  sortBy: SortCol | undefined;
  sortDir: SortDir;
  filter: FilterTab;
}

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all",          label: "Todos"          },
  { id: "vip",          label: "VIPs"           },
  { id: "inactive",     label: "Inativos 30d+"  },
  { id: "quente",       label: "🔥 Quentes"     },
  { id: "morno",        label: "🟡 Mornos"      },
  { id: "frio",         label: "🔴 Frios"       },
  { id: "neverOrdered", label: "Nunca pediu"    },
  { id: "firstTime",    label: "1º pedido"      },
  { id: "recent",       label: "Recentes"       },
];

const SORT_COLS: { id: SortCol; label: string }[] = [
  { id: "totalSpend",  label: "Gasto total"   },
  { id: "totalOrders", label: "Pedidos"       },
  { id: "lastOrderAt", label: "Último pedido" },
];

function buildUrl(p: {
  search?: string;
  page?: number;
  sortBy?: SortCol;
  sortDir?: SortDir;
  filter?: FilterTab;
}) {
  const q = new URLSearchParams();
  if (p.search)               q.set("search",  p.search);
  if (p.page && p.page > 1)  q.set("page",    String(p.page));
  if (p.sortBy)               q.set("sortBy",  p.sortBy);
  if (p.sortDir === "asc")    q.set("sortDir", "asc");
  if (p.filter && p.filter !== "all") q.set("filter", p.filter);
  const s = q.toString();
  return s ? `?${s}` : "?";
}

export default function CustomersClient({
  customers: initial,
  total,
  page,
  totalPages,
  search,
  sortBy,
  sortDir,
  filter,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<CustomerRow[]>(initial);

  // ── Bulk select ──────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  }

  const allSelected = rows.length > 0 && selected.size === rows.length;

  // ── Edit modal ──────────────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<CustomerRow | null>(null);
  const [editName,   setEditName]   = useState("");
  const [editPhone,  setEditPhone]  = useState("");
  const [editEmail,  setEditEmail]  = useState("");
  const [editErr,    setEditErr]    = useState("");
  const [editBusy,   setEditBusy]   = useState(false);

  function openEdit(c: CustomerRow) {
    setEditTarget(c);
    setEditName(c.name);
    setEditPhone(c.phone ?? "");
    setEditEmail(c.email ?? "");
    setEditErr("");
  }

  function closeEdit() {
    setEditTarget(null);
    setEditErr("");
  }

  async function submitEdit() {
    if (!editTarget) return;
    setEditBusy(true);
    setEditErr("");
    try {
      const res = await fetch(`/api/customers/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:  editName.trim(),
          phone: editPhone.trim(),
          email: editEmail.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setEditErr((body as { message?: string }).message ?? "Erro ao salvar");
        return;
      }
      const { data } = await res.json();
      setRows((prev) =>
        prev.map((c) =>
          c.id === editTarget.id
            ? { ...c, name: data.name, phone: data.phone, email: data.email }
            : c
        )
      );
      closeEdit();
    } finally {
      setEditBusy(false);
    }
  }

  // ── Delete confirm ──────────────────────────────────────────────────────────
  const [delTarget, setDelTarget] = useState<CustomerRow | null>(null);
  const [delBusy,   setDelBusy]   = useState(false);

  async function confirmDelete() {
    if (!delTarget) return;
    setDelBusy(true);
    try {
      const res = await fetch(`/api/customers/${delTarget.id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setRows((prev) => prev.filter((c) => c.id !== delTarget.id));
        setDelTarget(null);
      }
    } finally {
      setDelBusy(false);
    }
  }

  // ── Sorting ─────────────────────────────────────────────────────────────────
  function handleSort(col: SortCol) {
    const newDir: SortDir =
      sortBy === col ? (sortDir === "asc" ? "desc" : "asc") : "desc";
    router.push(buildUrl({ search, sortBy: col, sortDir: newDir, filter }));
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortBy !== col) return <span className="ml-0.5 text-muted">↕</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <>
      {/* Filter tabs */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => router.push(buildUrl({ search, sortBy, sortDir, filter: tab.id }))}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === tab.id
                ? "bg-brand-500 text-white shadow-sm"
                : "border border-line2 bg-paper text-ink2 hover:bg-[#FAFAF8]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bulk-select bar */}
      {selected.size > 0 && (
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5">
          <span className="text-xs font-semibold text-brand-800">
            {selected.size} cliente{selected.size !== 1 ? "s" : ""} selecionado{selected.size !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto rounded-lg px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
          >
            Limpar seleção
          </button>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-line2 bg-paper sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-[#FAFAF8] text-left text-xs font-medium uppercase tracking-wide text-muted">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-line2 text-brand-600 accent-brand-600"
                  title="Selecionar todos"
                />
              </th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Telefone</th>
              {SORT_COLS.map((col) => (
                <th key={col.id} className="px-4 py-3">
                  <button
                    onClick={() => handleSort(col.id)}
                    className="flex items-center gap-0.5 transition-colors hover:text-ink"
                  >
                    {col.label}
                    <SortIcon col={col.id} />
                  </button>
                </th>
              ))}
              <th className="w-20 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center">
                  <p className="text-sm text-muted">Nenhum cliente encontrado.</p>
                  {!search && filter === "all" && (
                    <div className="mt-3 flex justify-center">
                      <NewCustomerButton />
                    </div>
                  )}
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className={`hover:bg-[#FAFAF8] ${selected.has(c.id) ? "bg-brand-50" : ""}`}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleSelect(c.id)}
                    className="h-4 w-4 rounded border-line2 accent-brand-600"
                  />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/customers/${c.id}`}
                    className="font-medium text-brand-600 hover:underline"
                  >
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink2">{!c.phone || isGuestIdentifier(c.phone) ? "—" : c.phone}</td>
                <td className="px-4 py-3 font-medium text-ink2">
                  {c.totalSpend.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </td>
                <td className="px-4 py-3 text-ink2">{c.totalOrders}</td>
                <td className="px-4 py-3 text-muted">
                  {c.lastOrderAt
                    ? new Date(c.lastOrderAt).toLocaleDateString("pt-BR")
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => openEdit(c)}
                      title="Editar"
                      className="rounded-lg p-1.5 text-muted transition-colors hover:bg-blue-50 hover:text-blue-600"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => setDelTarget(c)}
                      title="Excluir"
                      className="rounded-lg p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 sm:hidden">
        {rows.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-muted">Nenhum cliente encontrado.</p>
            {!search && filter === "all" && (
              <div className="mt-3 flex justify-center">
                <NewCustomerButton />
              </div>
            )}
          </div>
        ) : (
          rows.map((c) => (
            <div
              key={c.id}
              className={`flex items-center gap-2 rounded-xl border bg-paper p-3 ${selected.has(c.id) ? "border-brand-300 bg-brand-50" : "border-line2"}`}
            >
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggleSelect(c.id)}
                className="h-4 w-4 shrink-0 rounded border-line2 accent-brand-600"
              />
              <Link href={`/customers/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{c.name}</p>
                  <p className="truncate text-xs text-muted">{!c.phone || isGuestIdentifier(c.phone) ? "—" : c.phone}</p>
                </div>
              </Link>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-ink2">{c.totalOrders} ped.</p>
                <p className="text-xs text-muted">
                  {c.lastOrderAt
                    ? new Date(c.lastOrderAt).toLocaleDateString("pt-BR")
                    : "—"}
                </p>
              </div>
              <div className="ml-1 flex shrink-0 flex-col gap-0.5">
                <button
                  onClick={() => openEdit(c)}
                  className="rounded-lg p-1.5 text-muted transition-colors hover:bg-blue-50 hover:text-blue-600"
                >
                  ✏️
                </button>
                <button
                  onClick={() => setDelTarget(c)}
                  className="rounded-lg p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildUrl({ search, page: page - 1, sortBy, sortDir, filter })}
                className="rounded-lg border border-line2 px-3 py-1 hover:bg-[#FAFAF8]"
              >
                ← Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildUrl({ search, page: page + 1, sortBy, sortDir, filter })}
                className="rounded-lg border border-line2 px-3 py-1 hover:bg-[#FAFAF8]"
              >
                Próxima →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Edit modal ────────────────────────────────────────────────────── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-paper p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-ink">Editar cliente</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink2">Nome</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink2">Telefone</label>
                <input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink2">
                  Email <span className="font-normal text-muted">(opcional)</span>
                </label>
                <input
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  type="email"
                  className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
            </div>
            {editErr && <p className="mt-2 text-xs text-red-500">{editErr}</p>}
            <div className="mt-5 flex gap-2">
              <button
                onClick={closeEdit}
                disabled={editBusy}
                className="flex-1 rounded-xl border border-line2 py-2.5 text-sm font-semibold text-ink2 hover:bg-[#FAFAF8] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={submitEdit}
                disabled={editBusy || !editName.trim() || !editPhone.trim()}
                className="flex-1 rounded-xl bg-brand-500 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {editBusy ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ──────────────────────────────────────────── */}
      {delTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-paper p-6 shadow-xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl">
              🗑️
            </div>
            <h2 className="mb-1 text-lg font-bold text-ink">Excluir cliente</h2>
            <p className="mb-5 text-sm text-muted">
              Tem certeza que deseja excluir{" "}
              <strong className="text-ink">{delTarget.name}</strong>?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDelTarget(null)}
                disabled={delBusy}
                className="flex-1 rounded-xl border border-line2 py-2.5 text-sm font-semibold text-ink2 hover:bg-[#FAFAF8] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={delBusy}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50"
              >
                {delBusy ? "Excluindo…" : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
