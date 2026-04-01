"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QRCard } from "./QRCard";

// ── Types ─────────────────────────────────────────────────────────────────────

type MenuSource = "MANUAL" | "EXTERNAL";

type Item = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  isActive: boolean;
  sortOrder: number;
  isAvailable: boolean;
  showInDelivery: boolean;
  showInDineIn: boolean;
};

type Category = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  source: MenuSource;
  items: Item[];
};

type CategoryFormState = { name: string; description: string };
type ItemFormState = { name: string; description: string; price: string };

const EMPTY_CAT: CategoryFormState = { name: "", description: "" };
const EMPTY_ITEM: ItemFormState = { name: "", description: "", price: "" };

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch(url: string, method: string, body?: object) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InlineError({ message }: { message: string }) {
  return (
    <p className="mt-1 rounded bg-red-50 px-3 py-1.5 text-xs text-red-600">{message}</p>
  );
}

function Spinner() {
  return <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />;
}

// ── Item row ──────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  categorySource,
  onSave,
  onDelete,
}: {
  item: Item;
  categorySource: MenuSource;
  onSave: (id: string, patch: Partial<ItemFormState & { isActive: boolean; isAvailable: boolean; showInDelivery: boolean; showInDineIn: boolean }>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ItemFormState>({
    name: item.name,
    description: item.description ?? "",
    price: String(item.price),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editable = categorySource === "MANUAL";

  async function handleSave() {
    const price = parseFloat(form.price);
    if (!form.name.trim() || isNaN(price) || price <= 0) {
      setError("Nome e preço válido são obrigatórios.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(item.id, { ...form, price: String(price) });
      setEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Remover "${item.name}"?`)) return;
    setBusy(true);
    try {
      await onDelete(item.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao remover.");
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="bg-orange-50 px-5 py-3 space-y-2">
        <div className="flex gap-2">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Nome do item"
            className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
          <input
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            placeholder="Preço"
            type="number"
            step="0.01"
            min="0"
            className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
        </div>
        <input
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Descrição (opcional)"
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
        />
        {error && <InlineError message={error} />}
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={busy}
            className="rounded bg-orange-500 px-3 py-1 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50">
            {busy ? <Spinner /> : "Salvar"}
          </button>
          <button onClick={() => setEditing(false)} className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between px-5 py-2.5 text-sm hover:bg-gray-50">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`font-medium truncate ${!item.isActive ? "text-gray-400 line-through" : "text-gray-900"}`}>
          {item.name}
        </span>
        {item.description && (
          <span className="hidden truncate text-xs text-gray-400 sm:inline">— {item.description}</span>
        )}
      </div>
      <div className="flex items-center gap-3 ml-4 shrink-0 flex-wrap justify-end">
        <span className="font-semibold text-gray-700">R$ {Number(item.price).toFixed(2)}</span>
        {editable && (
          <>
            <label className="flex cursor-pointer select-none items-center gap-1 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={item.isAvailable}
                onChange={() => onSave(item.id, { isAvailable: !item.isAvailable })}
                className="h-3.5 w-3.5 accent-orange-500"
              />
              Disponível
            </label>
            <label
              className={`flex select-none items-center gap-1 text-xs ${
                item.isAvailable ? "cursor-pointer text-gray-600" : "cursor-not-allowed opacity-40"
              }`}
            >
              <input
                type="checkbox"
                checked={item.showInDelivery}
                disabled={!item.isAvailable}
                onChange={() => onSave(item.id, { showInDelivery: !item.showInDelivery })}
                className="h-3.5 w-3.5 accent-orange-500"
              />
              Delivery
            </label>
            <label
              className={`flex select-none items-center gap-1 text-xs ${
                item.isAvailable ? "cursor-pointer text-gray-600" : "cursor-not-allowed opacity-40"
              }`}
            >
              <input
                type="checkbox"
                checked={item.showInDineIn}
                disabled={!item.isAvailable}
                onChange={() => onSave(item.id, { showInDineIn: !item.showInDineIn })}
                className="h-3.5 w-3.5 accent-orange-500"
              />
              Salão
            </label>
            <button onClick={() => setEditing(true)} className="text-xs text-blue-500 hover:underline">
              Editar
            </button>
            <button onClick={handleDelete} disabled={busy} className="text-xs text-red-400 hover:underline">
              {busy ? <Spinner /> : "Remover"}
            </button>
          </>
        )}
      </div>
    </li>
  );
}

// ── Add-item form ─────────────────────────────────────────────────────────────

function AddItemForm({ categoryId, onAdded }: { categoryId: string; onAdded: (item: Item) => void }) {
  const [form, setForm] = useState<ItemFormState>(EMPTY_ITEM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = parseFloat(form.price);
    if (!form.name.trim() || isNaN(price) || price <= 0) {
      setError("Nome e preço válido são obrigatórios.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch(`/api/menu/categories/${categoryId}/items`, "POST", {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        price,
      });
      onAdded(data.data);
      setForm(EMPTY_ITEM);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao adicionar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-dashed border-gray-200 bg-gray-50 px-5 py-3 space-y-2">
      <p className="text-xs font-medium text-gray-500">Novo item</p>
      <div className="flex gap-2">
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Nome do item" required
          className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
        <input value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          placeholder="Preço" type="number" step="0.01" min="0.01" required
          className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
      </div>
      <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        placeholder="Descrição (opcional)"
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
      {error && <InlineError message={error} />}
      <button type="submit" disabled={busy}
        className="rounded bg-orange-500 px-3 py-1 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50">
        {busy ? <Spinner /> : "Adicionar item"}
      </button>
    </form>
  );
}

// ── Category card ─────────────────────────────────────────────────────────────

function CategoryCard({
  category,
  onChange,
  onDelete,
}: {
  category: Category;
  onChange: (updated: Category) => void;
  onDelete: (id: string) => void;
}) {
  const [editingCat, setEditingCat] = useState(false);
  const [catForm, setCatForm] = useState<CategoryFormState>({
    name: category.name,
    description: category.description ?? "",
  });
  const [addingItem, setAddingItem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editable = category.source === "MANUAL";

  async function saveCat() {
    if (!catForm.name.trim()) { setError("Nome obrigatório."); return; }
    setBusy(true); setError("");
    try {
      const data = await apiFetch(`/api/menu/categories/${category.id}`, "PATCH", {
        name: catForm.name.trim(),
        description: catForm.description.trim() || undefined,
      });
      onChange({ ...category, name: data.data.name, description: data.data.description });
      setEditingCat(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally { setBusy(false); }
  }

  async function toggleActive() {
    try {
      await apiFetch(`/api/menu/categories/${category.id}`, "PATCH", { isActive: !category.isActive });
      onChange({ ...category, isActive: !category.isActive });
    } catch { /* ignore */ }
  }

  async function deleteCat() {
    if (!confirm(`Remover categoria "${category.name}" e todos os seus itens?`)) return;
    setBusy(true);
    try {
      await apiFetch(`/api/menu/categories/${category.id}`, "DELETE");
      onDelete(category.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao remover.");
      setBusy(false);
    }
  }

  async function saveItem(id: string, patch: Partial<ItemFormState & { isActive: boolean; isAvailable: boolean; showInDelivery: boolean; showInDineIn: boolean }>) {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name.trim();
    if (patch.description !== undefined) body.description = patch.description.trim() || undefined;
    if (patch.price !== undefined) body.price = parseFloat(patch.price);
    if (patch.isActive !== undefined) body.isActive = patch.isActive;
    if (patch.isAvailable !== undefined) body.isAvailable = patch.isAvailable;
    if (patch.showInDelivery !== undefined) body.showInDelivery = patch.showInDelivery;
    if (patch.showInDineIn !== undefined) body.showInDineIn = patch.showInDineIn;
    const data = await apiFetch(`/api/menu/items/${id}`, "PATCH", body);
    onChange({
      ...category,
      items: category.items.map((it) => (it.id === id ? data.data : it)),
    });
  }

  async function deleteItem(id: string) {
    await apiFetch(`/api/menu/items/${id}`, "DELETE");
    onChange({ ...category, items: category.items.filter((it) => it.id !== id) });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* Category header */}
      {editingCat ? (
        <div className="space-y-2 border-b border-gray-100 bg-orange-50 px-5 py-3">
          <input value={catForm.name} onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Nome da categoria"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-orange-400" />
          <input value={catForm.description} onChange={(e) => setCatForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Descrição (opcional)"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
          {error && <InlineError message={error} />}
          <div className="flex gap-2">
            <button onClick={saveCat} disabled={busy}
              className="rounded bg-orange-500 px-3 py-1 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50">
              {busy ? <Spinner /> : "Salvar"}
            </button>
            <button onClick={() => setEditingCat(false)} className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className={`font-semibold truncate ${!category.isActive ? "text-gray-400" : "text-gray-900"}`}>
              {category.name}
            </h2>
            {!category.isActive && (
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-500">inativo</span>
            )}
            {category.source === "EXTERNAL" && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600" title="Importado de integração externa — edição desativada">
                Importado
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-gray-400">{category.items.length} item{category.items.length !== 1 ? "s" : ""}</span>
            {editable && (
              <>
                <button onClick={toggleActive} title={category.isActive ? "Desativar" : "Ativar"}
                  className="text-xs text-gray-400 hover:text-gray-700">
                  {category.isActive ? "●" : "○"}
                </button>
                <button onClick={() => setEditingCat(true)} className="text-xs text-blue-500 hover:underline">Editar</button>
                <button onClick={deleteCat} disabled={busy} className="text-xs text-red-400 hover:underline">
                  {busy ? <Spinner /> : "Remover"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {error && !editingCat && <InlineError message={error} />}

      {/* Items */}
      {category.items.length === 0 && !addingItem && (
        <p className="px-5 py-4 text-sm text-gray-400">Nenhum item. {editable && "Adicione um item abaixo."}</p>
      )}
      {category.items.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {category.items.map((item) => (
            <ItemRow key={item.id} item={item} categorySource={category.source}
              onSave={saveItem} onDelete={deleteItem} />
          ))}
        </ul>
      )}

      {/* Add item */}
      {editable && (
        addingItem
          ? <AddItemForm categoryId={category.id} onAdded={(item) => {
              onChange({ ...category, items: [...category.items, item] });
              setAddingItem(false);
            }} />
          : <div className="border-t border-dashed border-gray-100 px-5 py-2">
              <button onClick={() => setAddingItem(true)}
                className="text-xs font-medium text-orange-500 hover:text-orange-700">
                + Adicionar item
              </button>
            </div>
      )}
    </div>
  );
}

// ── Add-category form ─────────────────────────────────────────────────────────

function AddCategoryForm({ onAdded }: { onAdded: (cat: Category) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CategoryFormState>(EMPTY_CAT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Nome obrigatório."); return; }
    setBusy(true); setError("");
    try {
      const data = await apiFetch("/api/menu/categories", "POST", {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      });
      onAdded({ ...data.data, items: [], source: data.data.source ?? "MANUAL" });
      setForm(EMPTY_CAT);
      setOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao criar categoria.");
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
        + Nova categoria
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit}
      className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-2">
      <p className="text-sm font-semibold text-gray-700">Nova categoria</p>
      <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        placeholder="Nome (ex: Pizzas, Bebidas)" required
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
      <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        placeholder="Descrição (opcional)"
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
      {error && <InlineError message={error} />}
      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className="rounded bg-orange-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
          {busy ? <Spinner /> : "Criar categoria"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setForm(EMPTY_CAT); setError(""); }}
          className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MenuManager({
  initialCategories,
  restaurantSlug,
  qrUrl,
}: {
  initialCategories: Category[];
  restaurantSlug: string;
  qrUrl: string;
}) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function refresh() {
    startTransition(() => router.refresh());
  }

  function updateCategory(updated: Category) {
    setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    refresh();
  }

  function removeCategory(id: string) {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    refresh();
  }

  function addCategory(cat: Category) {
    setCategories((prev) => [...prev, cat]);
    refresh();
  }

  return (
    <div className="space-y-4">
      {/* QR access card */}
      {restaurantSlug && <QRCard url={qrUrl} slug={restaurantSlug} />}

      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">
            {categories.length} categoria{categories.length !== 1 ? "s" : ""}
            {" · "}
            {categories.reduce((n, c) => n + c.items.length, 0)} item{categories.reduce((n, c) => n + c.items.length, 0) !== 1 ? "s" : ""}
          </p>
        </div>
        <AddCategoryForm onAdded={addCategory} />
      </div>

      {/* Empty state */}
      {categories.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400 space-y-3">
          <p>Nenhuma categoria criada ainda. Clique em <strong>+ Nova categoria</strong> para começar.</p>
          <p>
            Ou{" "}
            <a href="/seed-menu" className="font-medium text-orange-500 hover:underline">
              popular com um cardápio de exemplo
            </a>
            {" "}(pizzaria, 4 categorias, 11 itens).
          </p>
        </div>
      )}

      {/* Category cards */}
      {categories.map((cat) => (
        <CategoryCard key={cat.id} category={cat}
          onChange={updateCategory} onDelete={removeCategory} />
      ))}

      {/* Integration callout */}
      <div className="rounded-xl border border-dashed border-gray-200 p-4 text-xs text-gray-400">
        <span className="font-medium text-gray-500">Integração futura:</span> categorias e itens
        importados automaticamente de um sistema externo (POS, iFood, etc.) aparecerão aqui com a
        badge <span className="rounded bg-blue-100 px-1 text-blue-600">Importado</span> e não
        poderão ser editados manualmente.
      </div>
    </div>
  );
}
