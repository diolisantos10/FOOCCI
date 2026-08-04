"use client";

/**
 * StoreHeader — o topo de aplicativo do Cardápio sem IA (SÓ a Loja; o cardápio
 * da mesa /qr não usa isto). Barra grudada no topo, estilo marketplace
 * (referência iFood/Rappi): logomarca + nome + status de funcionamento no canto
 * esquerdo; à direita as duas ações de app — Minha conta (identificação, cupons,
 * endereços) e a Sacola com badge de quantidade.
 *
 * White-label: todos os acentos vêm de --brand-primary (nunca cor cravada).
 * Emenda do CEO (04/08) à regra "igual por construção": o corpo do cardápio
 * segue compartilhado com o QR; o TOPO da Loja é composição própria.
 */

const cap9 = (n: number) => (n > 9 ? "9+" : String(n));

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

/** Badge numérico na cor da marca (itens na sacola / cupons na conta). */
function CountBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={label}
      className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white"
      style={{ backgroundColor: "var(--brand-primary)" }}
    >
      {cap9(count)}
    </span>
  );
}

export function StoreHeader({
  restaurantName,
  logoUrl,
  isOpen,
  deliveryEnabled,
  pickupEnabled,
  cartCount,
  couponCount,
  identifiedName,
  onOpenAccount,
  onOpenCart,
}: {
  restaurantName: string;
  logoUrl: string | null;
  isOpen: boolean;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  cartCount: number;
  /** Cupons ativos do cliente — badge na conta (0 quando desconhecido). */
  couponCount: number;
  /** Nome do cliente identificado — vira avatar com iniciais. */
  identifiedName: string | null;
  onOpenAccount: () => void;
  onOpenCart: () => void;
}) {
  const modes =
    deliveryEnabled && pickupEnabled ? "entrega e retirada"
    : deliveryEnabled ? "entrega"
    : pickupEnabled ? "retirada"
    : null;

  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-sm">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2">
        {/* Logomarca no canto superior esquerdo */}
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={restaurantName}
            className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-gray-100"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--brand-primary)" }}
          >
            {initialsOf(restaurantName)}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight text-gray-900">
            {restaurantName}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-none text-gray-500">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${isOpen ? "bg-green-500" : "bg-gray-300"}`}
            />
            <span className="truncate">
              {isOpen ? "Aberto agora" : "Fechado agora"}
              {modes ? ` · ${modes}` : ""}
            </span>
          </p>
        </div>

        {/* Minha conta — avatar com iniciais quando identificado */}
        <button
          type="button"
          onClick={onOpenAccount}
          aria-label={
            identifiedName
              ? `Minha conta — ${identifiedName}${couponCount > 0 ? `, ${couponCount} ${couponCount === 1 ? "cupom" : "cupons"}` : ""}`
              : "Minha conta — identificar meu WhatsApp"
          }
          className="relative shrink-0 rounded-full transition active:scale-95"
        >
          {identifiedName ? (
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-semibold text-white shadow-sm"
              style={{ backgroundColor: "var(--brand-primary)" }}
            >
              {initialsOf(identifiedName)}
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition hover:bg-gray-200"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="3.6" />
                <path d="M4.5 20.4c1.5-3.4 4.3-5 7.5-5s6 1.6 7.5 5" />
              </svg>
            </span>
          )}
          <CountBadge count={couponCount} label={`${couponCount} cupons disponíveis`} />
        </button>

        {/* Sacola com badge de quantidade */}
        <button
          type="button"
          onClick={onOpenCart}
          aria-label={`Abrir sacola${cartCount > 0 ? ` — ${cartCount} ${cartCount === 1 ? "item" : "itens"}` : " — vazia"}`}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition hover:bg-gray-200 active:scale-95"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5.8 8h12.4l-1.1 11.1a1.7 1.7 0 0 1-1.7 1.5H8.6a1.7 1.7 0 0 1-1.7-1.5L5.8 8z" />
            <path d="M9 10.5V6.4a3 3 0 0 1 6 0v4.1" />
          </svg>
          <CountBadge count={cartCount} label={`${cartCount} itens na sacola`} />
        </button>
      </div>
    </header>
  );
}
