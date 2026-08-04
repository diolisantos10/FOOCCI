"use client";

/**
 * StoreAccountDrawer — o "menuzinho" da conta do cliente na Loja (Cardápio sem
 * IA): identidade (nome / WhatsApp / trocar), Meus cupons e Meus endereços.
 *
 * Dados REAIS, com a regra de segurança REAL: /customer-profile e /coupons são
 * read-only e exigem prova de posse do telefone (waToken — CR C1 / LGPD). Sem o
 * token (cliente que só digitou o telefone no WelcomeModal), o drawer NÃO finge:
 * explica honestamente que cupons e endereços aparecem entrando pelo link do
 * WhatsApp do restaurante. Estados obrigatórios tratados (carregando / vazio /
 * erro — DESIGN.md §6.1).
 *
 * O cupom escolhido aqui É aplicado no pedido: o LojaClient envia
 * customerCouponId no finalize, e o servidor revalida e recalcula o desconto
 * (CustomerCouponService.findRedeemable) — a tela nunca é a autoridade do valor.
 */

import type { WalletCoupon, CustomerAddress, WalletState } from "./lojaWallet";

function formatAddress(a: CustomerAddress): string {
  const line1 = [a.street, a.number].filter(Boolean).join(", ");
  const rest = [a.complement, a.neighborhood, a.city && a.state ? `${a.city}/${a.state}` : a.city || a.state]
    .filter(Boolean)
    .join(" · ");
  return [line1, rest].filter(Boolean).join(" — ");
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{children}</p>
  );
}

function CouponRow({
  coupon,
  applied,
  onApply,
  onRemove,
}: {
  coupon: WalletCoupon;
  applied: boolean;
  onApply: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div
        className="flex w-12 shrink-0 items-center justify-center text-xl"
        style={{ backgroundColor: "var(--brand-primary)" }}
        aria-hidden="true"
      >
        {coupon.isReward ? "🎁" : "🎟️"}
      </div>
      <div className="min-w-0 flex-1 px-3.5 py-2.5">
        <p className="truncate text-sm font-semibold text-gray-900">{coupon.label}</p>
        <p className="text-[11px] text-gray-500">
          {coupon.isReward ? "Recompensa — resgatada no pedido" : "Desconto aplicado no seu pedido"}
        </p>
        <p className="mt-0.5 text-[10px] text-gray-400">
          {coupon.expiresAt
            ? `Válido até ${new Date(coupon.expiresAt).toLocaleDateString("pt-BR")}`
            : "Sem validade"}
        </p>
      </div>
      <div className="flex shrink-0 items-center pr-3">
        {applied ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-semibold text-gray-600 transition hover:bg-gray-200"
          >
            Em uso ✓
          </button>
        ) : (
          <button
            type="button"
            onClick={onApply}
            className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-white transition hover:opacity-90 active:scale-95"
            style={{ backgroundColor: "var(--brand-primary)" }}
          >
            Usar
          </button>
        )}
      </div>
    </li>
  );
}

export function StoreAccountDrawer({
  identifiedName,
  identifiedPhone,
  wallet,
  appliedCouponId,
  usedAddressId,
  onClose,
  onIdentify,
  onResetIdentity,
  onRetry,
  onApplyCoupon,
  onRemoveCoupon,
  onUseAddress,
}: {
  identifiedName: string | null;
  identifiedPhone: string | null;
  wallet: WalletState;
  appliedCouponId: string | null;
  /** Endereço já escolhido para a entrega (feedback visual). */
  usedAddressId: string | null;
  onClose: () => void;
  /** Abre a identificação (WelcomeModal). */
  onIdentify: () => void;
  onResetIdentity: () => void;
  onRetry: () => void;
  onApplyCoupon: (c: WalletCoupon) => void;
  onRemoveCoupon: () => void;
  onUseAddress: (a: CustomerAddress) => void;
}) {
  const identified = Boolean(identifiedName || identifiedPhone);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Minha conta">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 flex h-full w-[88%] max-w-sm flex-col bg-white shadow-2xl">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <p className="text-base font-semibold text-gray-900">Minha conta</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Identidade */}
          {identified ? (
            <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3.5">
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm"
                style={{ backgroundColor: "var(--brand-primary)" }}
              >
                {initialsOf(identifiedName ?? "?")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {identifiedName ? `Olá, ${identifiedName}` : "Olá"}
                </p>
                {identifiedPhone && <p className="truncate text-xs text-gray-500">{identifiedPhone}</p>}
              </div>
              <button
                type="button"
                onClick={onResetIdentity}
                className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-600 ring-1 ring-gray-200 transition hover:bg-gray-100"
                aria-label="Trocar identificação"
              >
                Trocar
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-5 text-center">
              <p className="text-sm font-semibold text-gray-900">Você ainda não se identificou</p>
              <p className="mt-1 text-xs text-gray-500">
                Informe seu WhatsApp para agilizar o pedido e ver seus cupons.
              </p>
              <button
                type="button"
                onClick={onIdentify}
                className="mt-3 w-full rounded-2xl py-3 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.98]"
                style={{ backgroundColor: "var(--brand-primary)" }}
              >
                Identificar meu WhatsApp
              </button>
            </div>
          )}

          {/* Carteira travada — honestidade em vez de tela vazia mentirosa */}
          {identified && wallet.status === "locked" && (
            <div className="flex gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3.5">
              <span aria-hidden="true" className="text-lg">🔒</span>
              <p className="text-xs leading-relaxed text-gray-500">
                Por segurança, seus <span className="font-semibold text-gray-700">cupons</span> e{" "}
                <span className="font-semibold text-gray-700">endereços salvos</span> aparecem quando
                você abre o cardápio pelo link que o restaurante envia no seu WhatsApp.
              </p>
            </div>
          )}

          {/* Erro de carregamento */}
          {identified && wallet.status === "error" && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3.5">
              <p className="text-xs text-red-700">Não consegui carregar seus cupons e endereços.</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-red-600 ring-1 ring-red-200 transition hover:bg-red-100"
              >
                Tentar de novo
              </button>
            </div>
          )}

          {/* Carregando */}
          {identified && wallet.status === "loading" && (
            <div className="space-y-3" aria-label="Carregando seus dados">
              <div className="h-4 w-28 animate-pulse rounded-full bg-gray-100" />
              <div className="h-16 animate-pulse rounded-2xl bg-gray-100" />
              <div className="h-4 w-32 animate-pulse rounded-full bg-gray-100" />
              <div className="h-16 animate-pulse rounded-2xl bg-gray-100" />
            </div>
          )}

          {/* Cupons + endereços — só com a carteira aberta (token provado) */}
          {identified && wallet.status === "ready" && (
            <>
              <section>
                <SectionTitle>Meus cupons</SectionTitle>
                {wallet.coupons.length > 0 ? (
                  <ul className="space-y-2">
                    {wallet.coupons.map((c) => (
                      <CouponRow
                        key={c.id}
                        coupon={c}
                        applied={appliedCouponId === c.id}
                        onApply={() => onApplyCoupon(c)}
                        onRemove={onRemoveCoupon}
                      />
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-5 text-center">
                    <p aria-hidden="true" className="text-2xl">🎁</p>
                    <p className="mt-1 text-xs font-semibold text-gray-500">Nenhum cupom no momento</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">Eles chegam pelas mensagens do restaurante.</p>
                  </div>
                )}
              </section>

              <section>
                <SectionTitle>Meus endereços</SectionTitle>
                {wallet.addresses.length > 0 ? (
                  <ul className="space-y-2">
                    {wallet.addresses.map((a) => {
                      const used = usedAddressId === a.id;
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => onUseAddress(a)}
                            className={`w-full rounded-2xl border px-3.5 py-2.5 text-left transition ${
                              used ? "border-transparent ring-2" : "border-gray-100 hover:bg-gray-50"
                            }`}
                            style={used ? ({ ["--tw-ring-color" as string]: "var(--brand-primary)" } as React.CSSProperties) : undefined}
                          >
                            <span className="flex items-center gap-1.5">
                              <span aria-hidden="true" className="text-sm">📍</span>
                              {a.label && <span className="text-xs font-semibold text-gray-900">{a.label}</span>}
                              {a.isDefault && (
                                <span
                                  className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white"
                                  style={{ backgroundColor: "var(--brand-primary)" }}
                                >
                                  Padrão
                                </span>
                              )}
                              {used && (
                                <span className="ml-auto text-[10px] font-semibold" style={{ color: "var(--brand-primary)" }}>
                                  Na entrega ✓
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block pl-6 text-xs leading-snug text-gray-600">
                              {formatAddress(a)}
                            </span>
                            {!used && (
                              <span className="mt-1 block pl-6 text-[10px] text-gray-400">
                                Toque para usar na entrega
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-5 text-center">
                    <p aria-hidden="true" className="text-2xl">📍</p>
                    <p className="mt-1 text-xs font-semibold text-gray-500">Nenhum endereço salvo ainda</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">Você informa o endereço ao finalizar o pedido.</p>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
