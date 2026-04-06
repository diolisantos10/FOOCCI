"use client";

import { useState, useEffect, useRef, FormEvent } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Variant = {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
};

type Item = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  variants: Variant[];
};

type Category = {
  id: string;
  name: string;
  items: Item[];
};

type Props = {
  slug: string;
  restaurant: { name: string; logoUrl: string | null; phone: string | null };
  categories: Category[];
  featured: Item[];
  promoBanner?: Item | null;
};

type AgentMessage = { role: "user" | "agent"; text: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function waLink(phone: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}`;
}

// ── Welcome / CRM Identify Block ──────────────────────────────────────────────

type WelcomePhase = "form" | "loading" | "done";

function WelcomeBlock({
  slug,
  restaurantName,
}: {
  slug: string;
  restaurantName: string;
}) {
  const [phase, setPhase] = useState<WelcomePhase>("form");
  const [phoneInput, setPhoneInput] = useState("");
  const [greeting, setGreeting] = useState("");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!phoneInput.trim() || phase === "loading") return;
    setPhase("loading");

    try {
      const res = await fetch(`/api/qr/${slug}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneInput }),
      });
      const data: { found: boolean; name?: string } = await res.json();
      setGreeting(data.found && data.name ? `Olá, ${data.name}! 👋` : "Bem-vindo! 👋");
    } catch {
      setGreeting("Bem-vindo! 👋");
    }

    setPhase("done");
  }

  if (phase === "done") {
    return (
      <div className="mx-auto max-w-2xl px-4 pb-4">
        <div className="flex items-center justify-between rounded-full bg-orange-50 border border-orange-100 px-4 py-2.5">
          <span className="text-sm font-semibold text-orange-700">{greeting}</span>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="ml-3 text-orange-300 hover:text-orange-500 transition-colors text-xs leading-none"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-4">
      <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
        <p className="text-sm font-semibold text-gray-800">
          Bem-vindo ao {restaurantName}! 👋
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          Informe seu número para uma experiência personalizada.
        </p>
        <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
          <input
            type="tel"
            inputMode="numeric"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="(11) 99999-9999"
            disabled={phase === "loading"}
            className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={phase === "loading" || !phoneInput.trim()}
            className="shrink-0 rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-600 disabled:opacity-50"
          >
            {phase === "loading" ? "..." : "Entrar"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="mt-2.5 text-xs text-gray-400 transition-colors hover:text-gray-600"
        >
          Pular
        </button>
      </div>
    </div>
  );
}

// ── Product Modal ─────────────────────────────────────────────────────────────

function ProductModal({
  item,
  onClose,
}: {
  item: Item;
  onClose: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {item.imageUrl ? (
          <div className="relative h-56 sm:h-64 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          </div>
        ) : (
          <div className="h-32 shrink-0 bg-orange-50 flex items-center justify-center text-6xl">
            🍽️
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-sm text-white hover:bg-black/60 transition-colors"
          aria-label="Fechar"
        >
          ✕
        </button>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-bold text-gray-900 leading-tight">
              {item.name}
            </h3>
            <span className="shrink-0 text-lg font-bold text-orange-500">
              R$&nbsp;{formatPrice(item.price)}
            </span>
          </div>

          {item.description && (
            <p className="text-sm text-gray-600 leading-relaxed">
              {item.description}
            </p>
          )}

          {item.variants.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Variantes
              </p>
              <div className="space-y-1.5">
                {item.variants.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5 border border-gray-100"
                  >
                    <span className="text-sm text-gray-800">{v.name}</span>
                    <span className="text-sm font-bold text-gray-900">
                      R$&nbsp;{formatPrice(v.price)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-orange-500 py-3 text-sm font-bold text-white hover:bg-orange-600 transition-colors shadow-sm"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Promo Banner ─────────────────────────────────────────────────────────────

function PromoBanner({
  item,
  onClick,
}: {
  item: Item;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-full rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt={item.name}
          className="w-full h-52 object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-52 bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-7xl">
          🍽️
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 px-4 py-4 text-left">
        <span className="mb-1.5 inline-block rounded-full bg-orange-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          Promoção do dia
        </span>
        <p className="text-lg font-bold text-white leading-tight">{item.name}</p>
        <p className="mt-0.5 text-sm font-bold text-orange-300">
          R$&nbsp;{formatPrice(item.price)}
        </p>
      </div>
    </button>
  );
}

// ── Featured Carousel Card ────────────────────────────────────────────────────

function FeaturedCard({
  item,
  onClick,
}: {
  item: Item;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="snap-start shrink-0 w-40 rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden text-left hover:shadow-md hover:border-orange-100 transition-all"
    >
      <div className="h-36 bg-gray-100 overflow-hidden">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl">
            🍽️
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2">
          {item.name}
        </p>
        <p className="mt-1 text-xs font-bold text-orange-500">
          R$&nbsp;{formatPrice(item.price)}
        </p>
      </div>
    </button>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────

function ProductCard({
  item,
  isFirst,
  onClick,
}: {
  item: Item;
  isFirst: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-orange-100 transition-all overflow-hidden"
      >
        <div className="flex gap-3 p-3">
          <div className="flex-1 min-w-0 flex flex-col justify-between min-h-[128px]">
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="text-sm font-semibold text-gray-900 leading-tight">
                  {item.name}
                </p>
                {isFirst && (
                  <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-600">
                    Mais pedido
                  </span>
                )}
              </div>
              {item.description && (
                <p className="mt-1 text-xs text-gray-500 line-clamp-2 leading-relaxed">
                  {item.description}
                </p>
              )}
            </div>

            <div className="mt-3">
              <span className="text-base font-bold text-orange-500">
                R$&nbsp;{formatPrice(item.price)}
              </span>
            </div>
          </div>

          <div className="shrink-0 w-32 h-32 rounded-xl overflow-hidden bg-gray-100">
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl">
                🍽️
              </div>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

// ── Agent Panel ───────────────────────────────────────────────────────────────

function AgentPanel({
  slug,
  restaurantPhone,
  categories,
  onCategoryClick,
  onClose,
}: {
  slug: string;
  restaurantPhone: string | null;
  categories: Category[];
  onCategoryClick: (catId: string) => void;
  onClose?: () => void;
}) {
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      role: "agent",
      text: "Olá! Posso ajudar a encontrar pratos, tirar dúvidas sobre ingredientes ou alérgenos. O que você procura?",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const whatsapp = waLink(restaurantPhone);

  // Quick-reply chips: first 3 categories + common questions
  const quickReplies: { label: string; action: () => void }[] = [
    ...categories.slice(0, 3).map((c) => ({
      label: `Ver ${c.name}`,
      action: () => onCategoryClick(c.id),
    })),
    {
      label: "Tem opções vegetarianas?",
      action: () => sendMessage("Tem opções vegetarianas?"),
    },
    {
      label: "Quais são as promoções?",
      action: () => sendMessage("Quais são as promoções?"),
    },
  ];

  async function sendMessage(text: string) {
    if (!text.trim() || sending) return;
    const userMsg: AgentMessage = { role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setSending(true);

    try {
      const res = await fetch(`/api/qr/${slug}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (res.ok) {
        const data: { reply: string } = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: "agent", text: data.reply },
        ]);
      } else {
        throw new Error("no reply");
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: whatsapp
            ? "Não consegui responder agora. Use o botão abaixo para falar com um atendente pelo WhatsApp."
            : "Não consegui responder agora. Por favor, chame um atendente.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage(inputText);
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg leading-none">🤖</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">Agente IA</p>
            <p className="text-[10px] text-green-500 font-medium">Online agora</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-green-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-green-600 transition-colors"
            >
              <span>📱</span>
              <span>Falar com humano</span>
            </a>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-500 hover:bg-gray-200 transition-colors"
              aria-label="Fechar agente"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Quick-reply chips */}
      <div className="shrink-0 flex gap-2 overflow-x-auto px-4 py-2.5 scrollbar-hide border-b border-gray-50">
        {quickReplies.map((qr) => (
          <button
            key={qr.label}
            type="button"
            onClick={qr.action}
            className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-semibold text-orange-700 hover:bg-orange-100 transition-colors"
          >
            {qr.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "agent" && (
              <span className="mr-2 mt-0.5 shrink-0 text-base leading-none">🤖</span>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-orange-500 text-white rounded-br-sm"
                  : "bg-gray-100 text-gray-800 rounded-bl-sm"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <span className="mr-2 mt-0.5 shrink-0 text-base leading-none">🤖</span>
            <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-3 py-2 text-sm text-gray-400">
              digitando…
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 flex gap-2 px-3 py-3 border-t border-gray-100"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Pergunte algo..."
          disabled={sending}
          className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={sending || !inputText.trim()}
          className="shrink-0 rounded-xl bg-orange-500 px-3 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-600 disabled:opacity-40"
          aria-label="Enviar"
        >
          ➤
        </button>
      </form>
    </div>
  );
}

// ── Agent Dock (mobile-only fixed bottom bar + slide-up sheet) ────────────────

function AgentDock({
  slug,
  restaurantPhone,
  categories,
  onCategoryClick,
}: {
  slug: string;
  restaurantPhone: string | null;
  categories: Category[];
  onCategoryClick: (catId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const whatsapp = waLink(restaurantPhone);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock body scroll when sheet is open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  return (
    <>
      {/* Fixed dock bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white border-t border-gray-100 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex flex-1 items-center gap-2 rounded-xl bg-gray-50 border border-gray-200 px-4 py-2.5 text-sm text-gray-400 hover:border-orange-300 hover:bg-orange-50 transition-colors"
          >
            <span className="text-base leading-none">🤖</span>
            <span className="flex-1 text-left text-sm text-gray-500">Pergunte ao agente…</span>
          </button>
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1.5 rounded-xl bg-green-500 px-3 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-green-600 transition-colors"
            >
              <span>📱</span>
              <span>Humano</span>
            </a>
          )}
        </div>
      </div>

      {/* Slide-up sheet (mobile) */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* Sheet */}
          <div className="relative flex flex-col bg-white rounded-t-3xl shadow-2xl"
            style={{ height: "78vh" }}
          >
            {/* Drag handle */}
            <div className="shrink-0 flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>
            <div className="flex-1 overflow-hidden">
              <AgentPanel
                slug={slug}
                restaurantPhone={restaurantPhone}
                categories={categories}
                onCategoryClick={(catId) => {
                  setOpen(false);
                  // Small delay so the sheet closes before scroll
                  setTimeout(() => onCategoryClick(catId), 150);
                }}
                onClose={() => setOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main Client Component ─────────────────────────────────────────────────────

export function QRMenuClient({ slug, restaurant, categories, featured, promoBanner }: Props) {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(
    categories[0]?.id ?? ""
  );

  const navRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver: update active category chip as user scrolls
  useEffect(() => {
    if (categories.length === 0) return;

    const observers: IntersectionObserver[] = [];

    categories.forEach((cat) => {
      const el = document.getElementById(`cat-${cat.id}`);
      if (!el) return;
      const obs = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) setActiveCategory(cat.id);
        },
        { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, [categories]);

  // Scroll active chip into view
  useEffect(() => {
    if (!navRef.current || !activeCategory) return;
    const chip = navRef.current.querySelector(
      `[data-cat="${activeCategory}"]`
    ) as HTMLElement | null;
    chip?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeCategory]);

  function scrollToCategory(catId: string) {
    const el = document.getElementById(`cat-${catId}`);
    if (!el) return;
    const navHeight = navRef.current?.offsetHeight ?? 52;
    const top = el.getBoundingClientRect().top + window.scrollY - navHeight - 8;
    window.scrollTo({ top, behavior: "smooth" });
  }

  return (
    <>
      {selectedItem && (
        <ProductModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {/* ── DESKTOP SPLIT / MOBILE SINGLE COLUMN ──────────────────────────── */}
      <div className="min-h-screen bg-[#fafaf9] lg:flex lg:h-screen lg:overflow-hidden">

        {/* ── LEFT: Full menu (scrolls independently on desktop) ────────────── */}
        <div className="flex-1 min-w-0 overflow-y-auto">

          {/* HERO */}
          <div className="bg-white border-b border-gray-100">
            <div className="mx-auto max-w-2xl lg:max-w-none px-4 pt-8 pb-5 text-center">
              {restaurant.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={restaurant.logoUrl}
                  alt={restaurant.name}
                  className="mx-auto mb-4 h-20 w-20 rounded-full object-cover ring-4 ring-orange-50 shadow"
                  loading="lazy"
                />
              )}
              <h1 className="text-2xl font-bold text-gray-900">{restaurant.name}</h1>
              <p className="mt-1 text-xs text-gray-400">Cardápio digital</p>
            </div>

            {/* CRM soft capture */}
            <WelcomeBlock slug={slug} restaurantName={restaurant.name} />

            {/* Promo banner */}
            {promoBanner && (
              <div className="mx-auto max-w-2xl lg:max-w-none px-4 pb-5">
                <PromoBanner
                  item={promoBanner}
                  onClick={() => setSelectedItem(promoBanner)}
                />
              </div>
            )}

            {/* Featured carousel */}
            {featured.length > 0 && (
              <div className="mx-auto max-w-2xl lg:max-w-none px-4 pb-6">
                <p className="mb-3 text-sm font-bold text-gray-700">
                  ⭐ Mais pedidos
                </p>
                <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide">
                  {featured.map((item) => (
                    <FeaturedCard
                      key={item.id}
                      item={item}
                      onClick={() => setSelectedItem(item)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* STICKY CATEGORY NAV */}
          {categories.length > 1 && (
            <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
              <div
                ref={navRef}
                className="mx-auto max-w-2xl lg:max-w-none flex gap-2 overflow-x-auto px-4 py-3 scrollbar-hide"
              >
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    data-cat={cat.id}
                    onClick={() => scrollToCategory(cat.id)}
                    className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                      activeCategory === cat.id
                        ? "bg-orange-500 text-white shadow-sm"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PRODUCT SECTIONS */}
          {categories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400 text-sm">
              <span className="mb-3 text-4xl">🍽️</span>
              <p>Cardápio não disponível no momento.</p>
            </div>
          ) : (
            <main className="mx-auto max-w-2xl lg:max-w-none px-4 py-6 pb-28 lg:pb-8 space-y-10">
              {categories.map((cat) => (
                <section key={cat.id} id={`cat-${cat.id}`}>
                  <h2 className="mb-4 border-b border-gray-200 pb-2 text-base font-bold text-gray-900">
                    {cat.name}
                  </h2>
                  <ul className="space-y-3">
                    {cat.items.map((item, idx) => (
                      <ProductCard
                        key={item.id}
                        item={item}
                        isFirst={idx === 0}
                        onClick={() => setSelectedItem(item)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </main>
          )}

          <footer className="py-8 text-center text-xs text-gray-400">
            Cardápio gerado por Foocci
          </footer>
        </div>

        {/* ── RIGHT: Agent panel (desktop only, sticky sidebar) ──────────────── */}
        <div className="hidden lg:flex lg:flex-col lg:w-[380px] lg:shrink-0 border-l border-gray-100">
          <AgentPanel
            slug={slug}
            restaurantPhone={restaurant.phone}
            categories={categories}
            onCategoryClick={scrollToCategory}
          />
        </div>
      </div>

      {/* ── MOBILE AGENT DOCK (hidden on lg+) ─────────────────────────────────── */}
      <AgentDock
        slug={slug}
        restaurantPhone={restaurant.phone}
        categories={categories}
        onCategoryClick={scrollToCategory}
      />
    </>
  );
}
