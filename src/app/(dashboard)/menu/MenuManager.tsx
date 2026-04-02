"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { QRCard } from "./QRCard";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ── Types ─────────────────────────────────────────────────────────────────────

type MenuSource = "MANUAL" | "EXTERNAL";

type Item = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
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
  isAvailable: boolean;
  showInDelivery: boolean;
  showInDineIn: boolean;
  sortOrder: number;
  source: MenuSource;
  items: Item[];
};

type CategoryFormState = { name: string; description: string };
type ItemFormState = {
  name: string;
  description: string;
  price: string;
  imageUrl: string | null;
};

const EMPTY_CAT: CategoryFormState = { name: "", description: "" };
const EMPTY_ITEM: ItemFormState = {
  name: "",
  description: "",
  price: "",
  imageUrl: null,
};

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

// ── Primitives ────────────────────────────────────────────────────────────────

function InlineError({ message }: { message: string }) {
  return (
    <p className="mt-1 rounded bg-red-50 px-3 py-1.5 text-xs text-red-600">
      {message}
    </p>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
  );
}

function DragHandle({
  listeners,
}: {
  listeners?: Record<string, unknown>;
}) {
  return (
    <button
      type="button"
      {...(listeners as React.HTMLAttributes<HTMLButtonElement>)}
      className="cursor-grab touch-none select-none px-1 text-gray-300 hover:text-gray-500 active:cursor-grabbing"
      aria-label="Reordenar"
    >
      ⠿
    </button>
  );
}

// ── ToggleSwitch ──────────────────────────────────────────────────────────────

function ToggleSwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <span
      className={`flex select-none items-center gap-1.5 text-xs ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer text-gray-600"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
        className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
          checked ? "bg-orange-500" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform duration-150 ${
            checked ? "translate-x-3" : "translate-x-0"
          }`}
        />
      </button>
      {label}
    </span>
  );
}

// ── Image upload ──────────────────────────────────────────────────────────────

const UPLOAD_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const UPLOAD_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function ImageUpload({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!UPLOAD_ALLOWED_TYPES.includes(file.type)) {
      setError("Tipo não permitido. Use JPG, PNG ou WebP.");
      return;
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      setError("Arquivo muito grande. Máximo: 5 MB.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/menu/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro no upload.");
      onChange(data.data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar imagem.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1">
      {value && (
        <div className="relative inline-block">
          <img
            src={value}
            alt="Preview"
            className="h-16 w-16 rounded object-cover border border-gray-200"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white hover:bg-red-600"
          >
            ×
          </button>
        </div>
      )}
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="text-xs text-orange-500 hover:text-orange-700 disabled:opacity-50"
        >
          {uploading ? <Spinner /> : value ? "Trocar imagem" : "Adicionar imagem"}
        </button>
      </div>
      {error && <InlineError message={error} />}
    </div>
  );
}

// ── Item row ──────────────────────────────────────────────────────────────────

function SortableItemRow({
  item,
  categorySource,
  filterActive,
  onSave,
  onDelete,
  onEdit,
}: {
  item: Item;
  categorySource: MenuSource;
  filterActive?: boolean;
  onSave: (
    id: string,
    patch: Partial<{
      isAvailable: boolean;
      showInDelivery: boolean;
      showInDineIn: boolean;
    }>
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (item: Item) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editable = categorySource === "MANUAL";

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

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

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="flex flex-col px-3 py-2.5 text-sm hover:bg-gray-50"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {editable && !filterActive && <DragHandle listeners={listeners} />}
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="h-8 w-8 shrink-0 rounded object-cover"
            />
          ) : (
            <div className="h-8 w-8 shrink-0 rounded bg-gray-100" />
          )}
          <span
            className={`font-medium truncate ${
              !item.isActive ? "text-gray-400 line-through" : "text-gray-900"
            }`}
          >
            {item.name}
          </span>
          {item.description && (
            <span className="hidden truncate text-xs text-gray-400 sm:inline">
              — {item.description}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 ml-4 shrink-0 flex-wrap justify-end">
          <span className="font-semibold text-gray-700">
            R$ {Number(item.price).toFixed(2)}
          </span>
          {editable && (
            <>
              <ToggleSwitch
                label="Disponível"
                checked={item.isAvailable}
                onChange={() => onSave(item.id, { isAvailable: !item.isAvailable })}
              />
              <ToggleSwitch
                label="Delivery"
                checked={item.showInDelivery}
                disabled={!item.isAvailable}
                onChange={() => onSave(item.id, { showInDelivery: !item.showInDelivery })}
              />
              <ToggleSwitch
                label="Salão"
                checked={item.showInDineIn}
                disabled={!item.isAvailable}
                onChange={() => onSave(item.id, { showInDineIn: !item.showInDineIn })}
              />
              <button
                onClick={() => onEdit(item)}
                className="text-xs text-blue-500 hover:underline"
              >
                Editar
              </button>
              <button
                onClick={handleDelete}
                disabled={busy}
                className="text-xs text-red-400 hover:underline"
              >
                {busy ? <Spinner /> : "Remover"}
              </button>
            </>
          )}
        </div>
      </div>
      {error && <InlineError message={error} />}
    </li>
  );
}

// ── Add-item form ─────────────────────────────────────────────────────────────

function AddItemForm({
  categoryId,
  onAdded,
}: {
  categoryId: string;
  onAdded: (item: Item) => void;
}) {
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
      const data = await apiFetch(
        `/api/menu/categories/${categoryId}/items`,
        "POST",
        {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          price,
          imageUrl: form.imageUrl || undefined,
        }
      );
      onAdded(data.data);
      setForm(EMPTY_ITEM);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao adicionar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-dashed border-gray-200 bg-gray-50 px-5 py-3 space-y-2"
    >
      <p className="text-xs font-medium text-gray-500">Novo item</p>
      <div className="flex gap-2">
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Nome do item"
          required
          className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
        />
        <input
          value={form.price}
          onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          placeholder="Preço"
          type="number"
          step="0.01"
          min="0.01"
          required
          className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
        />
      </div>
      <input
        value={form.description}
        onChange={(e) =>
          setForm((f) => ({ ...f, description: e.target.value }))
        }
        placeholder="Descrição (opcional)"
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
      />
      <ImageUpload
        value={form.imageUrl}
        onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
      />
      {error && <InlineError message={error} />}
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-orange-500 px-3 py-1 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {busy ? <Spinner /> : "Adicionar item"}
      </button>
    </form>
  );
}

// ── Category card ─────────────────────────────────────────────────────────────

function CategoryCard({
  category,
  dragListeners,
  filterActive,
  onChange,
  onDelete,
  onEditItem,
}: {
  category: Category;
  dragListeners?: Record<string, unknown>;
  filterActive?: boolean;
  onChange: (updated: Category) => void;
  onDelete: (id: string) => void;
  onEditItem: (item: Item, categoryId: string) => void;
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

  const itemSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  async function saveCat() {
    if (!catForm.name.trim()) {
      setError("Nome obrigatório.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch(
        `/api/menu/categories/${category.id}`,
        "PATCH",
        {
          name: catForm.name.trim(),
          description: catForm.description.trim() || undefined,
        }
      );
      onChange({
        ...category,
        name: data.data.name,
        description: data.data.description,
      });
      setEditingCat(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    try {
      await apiFetch(`/api/menu/categories/${category.id}`, "PATCH", {
        isActive: !category.isActive,
      });
      onChange({ ...category, isActive: !category.isActive });
    } catch {
      /* ignore */
    }
  }

  // Category-level flags write only to the category, never to its items.
  // isAvailable acts purely as a gate: when false it disables the channel
  // toggles in the UI, but each item's own flags are untouched.
  async function saveCategoryFlag(
    flag: "isAvailable" | "showInDelivery" | "showInDineIn",
    value: boolean
  ) {
    try {
      await apiFetch(`/api/menu/categories/${category.id}`, "PATCH", {
        [flag]: value,
      });
      onChange({ ...category, [flag]: value });
    } catch {
      /* ignore */
    }
  }

  async function deleteCat() {
    if (
      !confirm(`Remover categoria "${category.name}" e todos os seus itens?`)
    )
      return;
    setBusy(true);
    try {
      await apiFetch(`/api/menu/categories/${category.id}`, "DELETE");
      onDelete(category.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao remover.");
      setBusy(false);
    }
  }

  async function saveItem(
    id: string,
    patch: Partial<{
      isAvailable: boolean;
      showInDelivery: boolean;
      showInDineIn: boolean;
    }>
  ) {
    const body: Record<string, unknown> = {};
    if (patch.isAvailable !== undefined) body.isAvailable = patch.isAvailable;
    if (patch.showInDelivery !== undefined) body.showInDelivery = patch.showInDelivery;
    if (patch.showInDineIn !== undefined) body.showInDineIn = patch.showInDineIn;
    const data = await apiFetch(`/api/menu/items/${id}`, "PATCH", body);
    onChange({
      ...category,
      items: category.items.map((it) =>
        it.id === id ? { ...it, ...data.data, price: Number(data.data.price) } : it
      ),
    });
  }

  async function deleteItem(id: string) {
    await apiFetch(`/api/menu/items/${id}`, "DELETE");
    onChange({
      ...category,
      items: category.items.filter((it) => it.id !== id),
    });
  }

  async function handleItemDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = category.items.findIndex((i) => i.id === active.id);
    const newIndex = category.items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(category.items, oldIndex, newIndex);

    // Optimistic update
    onChange({ ...category, items: reordered });

    try {
      await apiFetch(
        `/api/menu/items/${reordered[0]!.id}?action=reorder&categoryId=${category.id}`,
        "PATCH",
        { items: reordered.map((it, i) => ({ id: it.id, sortOrder: i })) }
      );
    } catch {
      // Revert on failure
      onChange({ ...category });
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* Category header */}
      {editingCat ? (
        <div className="space-y-2 border-b border-gray-100 bg-orange-50 px-5 py-3">
          <input
            value={catForm.name}
            onChange={(e) =>
              setCatForm((f) => ({ ...f, name: e.target.value }))
            }
            placeholder="Nome da categoria"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
          <input
            value={catForm.description}
            onChange={(e) =>
              setCatForm((f) => ({ ...f, description: e.target.value }))
            }
            placeholder="Descrição (opcional)"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
          {error && <InlineError message={error} />}
          <div className="flex gap-2">
            <button
              onClick={saveCat}
              disabled={busy}
              className="rounded bg-orange-500 px-3 py-1 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {busy ? <Spinner /> : "Salvar"}
            </button>
            <button
              onClick={() => setEditingCat(false)}
              className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
          {/* Left: drag handle + name */}
          <div className="flex items-center gap-1 min-w-0">
            {editable && <DragHandle listeners={dragListeners} />}
            <h2
              className={`font-semibold truncate ${
                !category.isActive ? "text-gray-400" : "text-gray-900"
              }`}
            >
              {category.name}
            </h2>
            {!category.isActive && (
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-500">
                inativo
              </span>
            )}
            {category.source === "EXTERNAL" && (
              <span
                className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600"
                title="Importado de integração externa — edição desativada"
              >
                Importado
              </span>
            )}
          </div>

          {/* Right: category-level controls + actions */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <span className="text-xs text-gray-400">
              {category.items.length} item
              {category.items.length !== 1 ? "s" : ""}
            </span>
            {editable && (
              <>
                <ToggleSwitch
                  label="Disponível"
                  checked={category.isAvailable}
                  onChange={() => saveCategoryFlag("isAvailable", !category.isAvailable)}
                />
                <ToggleSwitch
                  label="Delivery"
                  checked={category.showInDelivery}
                  disabled={!category.isAvailable}
                  onChange={() => saveCategoryFlag("showInDelivery", !category.showInDelivery)}
                />
                <ToggleSwitch
                  label="Salão"
                  checked={category.showInDineIn}
                  disabled={!category.isAvailable}
                  onChange={() => saveCategoryFlag("showInDineIn", !category.showInDineIn)}
                />
                <button
                  onClick={toggleActive}
                  title={category.isActive ? "Desativar" : "Ativar"}
                  className="text-xs text-gray-400 hover:text-gray-700"
                >
                  {category.isActive ? "●" : "○"}
                </button>
                <button
                  onClick={() => setEditingCat(true)}
                  className="text-xs text-blue-500 hover:underline"
                >
                  Editar
                </button>
                <button
                  onClick={deleteCat}
                  disabled={busy}
                  className="text-xs text-red-400 hover:underline"
                >
                  {busy ? <Spinner /> : "Remover"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {error && !editingCat && <InlineError message={error} />}

      {/* Items with per-category drag-and-drop */}
      {category.items.length === 0 && !addingItem && (
        <p className="px-5 py-4 text-sm text-gray-400">
          Nenhum item. {editable && "Adicione um item abaixo."}
        </p>
      )}
      {category.items.length > 0 && (
        <DndContext
          sensors={itemSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleItemDragEnd}
        >
          <SortableContext
            items={category.items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="divide-y divide-gray-100">
              {category.items.map((item) => (
                <SortableItemRow
                  key={item.id}
                  item={item}
                  categorySource={category.source}
                  filterActive={filterActive}
                  onSave={saveItem}
                  onDelete={deleteItem}
                  onEdit={(it) => onEditItem(it, category.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {/* Add item */}
      {editable &&
        (addingItem ? (
          <AddItemForm
            categoryId={category.id}
            onAdded={(item) => {
              onChange({ ...category, items: [...category.items, item] });
              setAddingItem(false);
            }}
          />
        ) : (
          <div className="border-t border-dashed border-gray-100 px-5 py-2">
            <button
              onClick={() => setAddingItem(true)}
              className="text-xs font-medium text-orange-500 hover:text-orange-700"
            >
              + Adicionar item
            </button>
          </div>
        ))}
    </div>
  );
}

// ── Sortable category wrapper ─────────────────────────────────────────────────

function SortableCategoryCard(
  props: Omit<React.ComponentProps<typeof CategoryCard>, "dragListeners">
) {
  const { filterActive, ...rest } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.category.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
    >
      <CategoryCard
        {...rest}
        filterActive={filterActive}
        dragListeners={filterActive ? undefined : listeners}
      />
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
    if (!form.name.trim()) {
      setError("Nome obrigatório.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch("/api/menu/categories", "POST", {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      });
      onAdded({
        ...data.data,
        items: [],
        source: data.data.source ?? "MANUAL",
      });
      setForm(EMPTY_CAT);
      setOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao criar categoria.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
      >
        + Nova categoria
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-2"
    >
      <p className="text-sm font-semibold text-gray-700">Nova categoria</p>
      <input
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        placeholder="Nome (ex: Pizzas, Bebidas)"
        required
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
      />
      <input
        value={form.description}
        onChange={(e) =>
          setForm((f) => ({ ...f, description: e.target.value }))
        }
        placeholder="Descrição (opcional)"
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
      />
      {error && <InlineError message={error} />}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-orange-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {busy ? <Spinner /> : "Criar categoria"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setForm(EMPTY_CAT);
            setError("");
          }}
          className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ── TopBar ────────────────────────────────────────────────────────────────────

function TopBar({
  categories,
  onAdded,
}: {
  categories: Category[];
  onAdded: (cat: Category) => void;
}) {
  const totalItems = categories.reduce((n, c) => n + c.items.length, 0);
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-gray-500">
        {categories.length} categoria
        {categories.length !== 1 ? "s" : ""}
        {" · "}
        {totalItems} item
        {totalItems !== 1 ? "s" : ""}
      </p>
      <AddCategoryForm onAdded={onAdded} />
    </div>
  );
}

// ── CategoryFilter ────────────────────────────────────────────────────────────

function CategoryFilter({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: string;
  onChange: (v: string) => void;
}) {
  if (categories.length === 0) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-orange-400"
    >
      <option value="">Todas categorias</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

// ── EditItemModal ─────────────────────────────────────────────────────────────

type EditModalForm = {
  name: string;
  description: string;
  price: string;
  imageUrl: string | null;
  showInDelivery: boolean;
  showInDineIn: boolean;
};

function EditItemModal({
  item,
  onClose,
  onSave,
}: {
  item: Item | null;
  onClose: () => void;
  onSave: (patch: EditModalForm) => Promise<void>;
}) {
  const [form, setForm] = useState<EditModalForm>({
    name: "",
    description: "",
    price: "",
    imageUrl: null,
    showInDelivery: false,
    showInDineIn: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Sync form whenever a different item is opened
  useEffect(() => {
    if (!item) return;
    setForm({
      name: item.name,
      description: item.description ?? "",
      price: String(item.price),
      imageUrl: item.imageUrl ?? null,
      showInDelivery: item.showInDelivery,
      showInDineIn: item.showInDineIn,
    });
    setError("");
  }, [item?.id]);

  // Close on Escape
  useEffect(() => {
    if (!item) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  if (!item) return null;

  async function handleSave() {
    const price = parseFloat(form.price);
    if (!form.name.trim() || isNaN(price) || price <= 0) {
      setError("Nome e preço válido são obrigatórios.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({ ...form, price: String(price) });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">Editar item</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-lg leading-none text-gray-400 hover:text-gray-600"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Name */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">
              Nome <span className="text-red-500">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nome do item"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">
              Descrição
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="Descrição (opcional)"
              rows={3}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
          </div>

          {/* Price */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">
              Preço <span className="text-red-500">*</span>
            </label>
            <input
              value={form.price}
              onChange={(e) =>
                setForm((f) => ({ ...f, price: e.target.value }))
              }
              placeholder="0,00"
              type="number"
              step="0.01"
              min="0.01"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
          </div>

          {/* Image */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">
              Imagem
            </label>
            <ImageUpload
              value={form.imageUrl}
              onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
            />
          </div>

          {/* Channel toggles */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-700">Canais</p>
            <div className="flex gap-4">
              <ToggleSwitch
                label="Delivery"
                checked={form.showInDelivery}
                onChange={() =>
                  setForm((f) => ({ ...f, showInDelivery: !f.showInDelivery }))
                }
              />
              <ToggleSwitch
                label="Salão"
                checked={form.showInDineIn}
                onChange={() =>
                  setForm((f) => ({ ...f, showInDineIn: !f.showInDineIn }))
                }
              />
            </div>
          </div>

          {error && <InlineError message={error} />}
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="flex-1 rounded-lg bg-orange-500 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {busy ? <Spinner /> : "Salvar"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </>
  );
}

// ── BulkPriceModal ────────────────────────────────────────────────────────────
// Placeholder – bulk price update logic will be implemented in a future step

function BulkPriceModal() {
  return null;
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
  const [filterQuery, setFilterQuery] = useState("");
  const [editingItem, setEditingItem] = useState<{
    item: Item;
    categoryId: string;
  } | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const isFilterActive = filterQuery !== "";
  const visibleCategories = isFilterActive
    ? categories.filter((c) => c.id === filterQuery)
    : categories;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function refresh() {
    startTransition(() => router.refresh());
  }

  function updateCategory(updated: Category) {
    setCategories((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
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

  async function handleModalSave(patch: EditModalForm) {
    if (!editingItem) return;
    const { item, categoryId } = editingItem;
    const body: Record<string, unknown> = {
      name: patch.name.trim(),
      description: patch.description.trim() || undefined,
      price: parseFloat(patch.price),
      imageUrl: patch.imageUrl ?? "",
      showInDelivery: patch.showInDelivery,
      showInDineIn: patch.showInDineIn,
    };
    const data = await apiFetch(`/api/menu/items/${item.id}`, "PATCH", body);
    const updated: Item = { ...item, ...data.data, price: Number(data.data.price) };
    setCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId
          ? { ...c, items: c.items.map((it) => (it.id === item.id ? updated : it)) }
          : c
      )
    );
    refresh();
  }

  async function handleCategoryDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(categories, oldIndex, newIndex);

    // Optimistic update
    setCategories(reordered);

    try {
      await apiFetch(
        `/api/menu/categories/${reordered[0]!.id}?action=reorder`,
        "PATCH",
        { items: reordered.map((c, i) => ({ id: c.id, sortOrder: i })) }
      );
    } catch {
      // Revert on failure
      setCategories(categories);
    }
  }

  return (
    <div className="space-y-4">
      {/* QR access card */}
      {restaurantSlug && <QRCard url={qrUrl} slug={restaurantSlug} />}

      {/* Header actions */}
      <TopBar categories={categories} onAdded={addCategory} />

      {/* Category filter */}
      <CategoryFilter
        categories={categories}
        value={filterQuery}
        onChange={setFilterQuery}
      />

      {/* Empty state */}
      {categories.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400 space-y-3">
          <p>
            Nenhuma categoria criada ainda. Clique em{" "}
            <strong>+ Nova categoria</strong> para começar.
          </p>
          <p>
            Ou{" "}
            <a
              href="/seed-menu"
              className="font-medium text-orange-500 hover:underline"
            >
              popular com um cardápio de exemplo
            </a>{" "}
            (pizzaria, 4 categorias, 11 itens).
          </p>
        </div>
      )}

      {/* Category cards with drag-and-drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleCategoryDragEnd}
      >
        <SortableContext
          items={visibleCategories.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-4">
            {visibleCategories.map((cat) => (
              <SortableCategoryCard
                key={cat.id}
                category={cat}
                filterActive={isFilterActive}
                onChange={updateCategory}
                onDelete={removeCategory}
                onEditItem={(item, categoryId) => setEditingItem({ item, categoryId })}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Integration callout */}
      <div className="rounded-xl border border-dashed border-gray-200 p-4 text-xs text-gray-400">
        <span className="font-medium text-gray-500">Integração futura:</span>{" "}
        categorias e itens importados automaticamente de um sistema externo
        (POS, iFood, etc.) aparecerão aqui com a badge{" "}
        <span className="rounded bg-blue-100 px-1 text-blue-600">
          Importado
        </span>{" "}
        e não poderão ser editados manualmente.
      </div>

      {/* Edit item drawer */}
      <EditItemModal
        item={editingItem?.item ?? null}
        onClose={() => setEditingItem(null)}
        onSave={handleModalSave}
      />
    </div>
  );
}
