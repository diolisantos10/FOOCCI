"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type SortCol = "totalSpend" | "totalOrders" | "lastOrderAt";
export type SortDir = "asc" | "desc";
export type FilterTab = "all" | "vip" | "inactive" | "firstTime" | "recent";

export type CustomerRow = {
  id: string;
  name: string;
  phone: string;
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
  { id: "all",       label: "Todos"         },
  { id: "vip",       label: "VIPs"          },
  { id: "inactive",  label: "Inativos 30d"  },
  { id: "firstTime", label: "1º pedido"     },
  { id: "recent",    label: "Recentes"      },
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
    setEditPhone(c.phone);
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
    if (sortBy !== col) return <span className="ml-0.5 text-gray-300">↕</span>;
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
                ? "bg-orange-500 text-white shadow-sm"
                : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Telefone</th>
              {SORT_COLS.map((col) => (
                <th key={col.id} className="px-4 py-3">
                  <button
                    onClick={() => handleSort(col.id)}
                    className="flex items-center gap-0.5 transition-colors hover:text-gray-800"
                  >
                    {col.label}
                    <SortIcon col={col.id} />
                  </button>
                </th>
              ))}
              <th className="w-20 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="group hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/customers/${c.id}`}
                    className="font-medium text-brand-600 hover:underline"
                  >
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-600">{c.phone}</td>
                <td className="px-4 py-3 font-medium text-gray-700">
                  {c.totalSpend.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </td>
                <td className="px-4 py-3 text-gray-600">{c.totalOrders}</td>
                <td className="px-4 py-3 text-gray-400">
                  {c.lastOrderAt
                    ? new Date(c.lastOrderAt).toLocaleDateString("pt-BR")
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => openEdit(c)}
                      title="Editar"
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => setDelTarget(c)}
                      title="Excluir"
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
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
          <p className="py-8 text-center text-sm text-gray-400">Nenhum cliente encontrado.</p>
        ) : (
          rows.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-3"
            >
              <Link href={`/customers/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{c.name}</p>
                  <p className="truncate text-xs text-gray-500">{c.phone}</p>
                </div>
              </Link>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-gray-700">{c.totalOrders} ped.</p>
                <p className="text-xs text-gray-400">
                  {c.lastOrderAt
                    ? new Date(c.lastOrderAt).toLocaleDateString("pt-BR")
                    : "—"}
                </p>
              </div>
              <div className="ml-1 flex shrink-0 flex-col gap-0.5">
                <button
                  onClick={() => openEdit(c)}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                >
                  ✏️
                </button>
                <button
                  onClick={() => setDelTarget(c)}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
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
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildUrl({ search, page: page - 1, sortBy, sortDir, filter })}
                className="rounded-lg border border-gray-300 px-3 py-1 hover:bg-gray-50"
              >
                ← Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildUrl({ search, page: page + 1, sortBy, sortDir, filter })}
                className="rounded-lg border border-gray-300 px-3 py-1 hover:bg-gray-50"
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
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Editar cliente</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">Nome</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">Telefone</label>
                <input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">
                  Email <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <input
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  type="email"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
            </div>
            {editErr && <p className="mt-2 text-xs text-red-500">{editErr}</p>}
            <div className="mt-5 flex gap-2">
              <button
                onClick={closeEdit}
                disabled={editBusy}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={submitEdit}
                disabled={editBusy || !editName.trim() || !editPhone.trim()}
                className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"
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
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl">
              🗑️
            </div>
            <h2 className="mb-1 text-lg font-bold text-gray-900">Excluir cliente</h2>
            <p className="mb-5 text-sm text-gray-500">
              Tem certeza que deseja excluir{" "}
              <strong className="text-gray-900">{delTarget.name}</strong>?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDelTarget(null)}
                disabled={delBusy}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
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
