"use client";

/**
 * AssistantNotifications — o modo "Avisos" do Assistente.
 *
 * É a mesma feira de notificações operacionais que vivia na aba do balãozinho
 * (mesmo hook, mesmo estado de lido por navegador). Mudou a casa, não a regra.
 */

import {
  relTime,
  TYPE_ICON,
  TYPE_LABEL,
  type NotifType,
  type NotifPriority,
  type NotifStatus,
  type NotificationItem,
} from "./useNotifications";

/**
 * Paleta desta superfície em TOKENS (DESIGN.md §1). O mapa legado do hook ainda
 * carrega `purple/teal/gray` crus — cor de categoria em roxo não é a marca. Aqui
 * o laranja é `brand`, e o resto é status semântico.
 */
const TYPE_COLOR: Record<NotifType, string> = {
  atendimento: "text-blue-600",
  pedido: "text-brand-600",
  pagamento: "text-green-700",
  integracao: "text-amber-700",
  sistema: "text-muted",
};

const PRIORITY_EDGE: Record<NotifPriority, string> = {
  critical: "border-l-red-500",
  important: "border-l-brand-400",
  normal: "border-l-line2",
};

interface Props {
  notifs: NotificationItem[];
  readIds: Set<string>;
  unreadCount: number;
  hasCritical: boolean;
  status: NotifStatus;
  onReload: () => void;
  onMarkAll: () => void;
  onOpen: (n: NotificationItem) => void;
}

export default function AssistantNotifications({
  notifs,
  readIds,
  unreadCount,
  hasCritical,
  status,
  onReload,
  onMarkAll,
  onOpen,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-paper">
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2.5 sm:px-5">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-ink">Avisos da operação</span>
            {unreadCount > 0 && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  hasCritical ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-600"
                }`}
              >
                {unreadCount} nov{unreadCount !== 1 ? "os" : "o"}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAll}
              className="shrink-0 text-[12px] font-semibold text-brand-600 transition-colors hover:text-brand-700"
            >
              Marcar tudo como lido
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Carregando — esqueleto, nunca "tudo em ordem" antes de saber. */}
        {status === "loading" && notifs.length === 0 ? (
          <ul className="mx-auto w-full max-w-3xl divide-y divide-line/60" aria-busy>
            {[0, 1, 2].map((i) => (
              <li key={i} className="px-4 py-3.5">
                <div className="flex items-start gap-2.5">
                  <span className="h-4 w-4 shrink-0 animate-pulse rounded bg-line2" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <span className="block h-3 w-4/5 animate-pulse rounded bg-line2" />
                    <span className="block h-2.5 w-1/3 animate-pulse rounded bg-line" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : status === "error" && notifs.length === 0 ? (
          /* Erro — o que houve + como resolver, nunca tela morta. */
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <span className="text-3xl opacity-40" aria-hidden>
              📡
            </span>
            <p className="text-[13.5px] font-semibold text-ink2">
              Não consegui buscar os avisos
            </p>
            <p className="max-w-xs text-[12.5px] leading-snug text-muted">
              Pode ser a conexão. Não quer dizer que está tudo em ordem — quer dizer que eu
              ainda não sei.
            </p>
            <button
              type="button"
              onClick={onReload}
              className="mt-2 inline-flex items-center justify-center rounded-xl border border-brand-500 bg-brand-500 px-4 py-2 text-[13px] font-semibold text-paper shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] transition-colors hover:bg-brand-600"
            >
              Tentar de novo
            </button>
          </div>
        ) : notifs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <span className="text-3xl opacity-40" aria-hidden>
              🔔
            </span>
            <p className="text-[13.5px] font-semibold text-ink2">Tudo em ordem por aqui</p>
            <p className="max-w-xs text-[12.5px] leading-snug text-muted">
              Pedido parado, pagamento com erro ou integração caída aparecem nesta lista assim que
              acontecerem.
            </p>
          </div>
        ) : (
          <ul className="mx-auto w-full max-w-3xl divide-y divide-line/60">
            {notifs.map((n) => {
              const isRead = readIds.has(n.id);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(n)}
                    className={`w-full border-l-4 px-4 py-3 text-left transition-colors hover:bg-canvas ${PRIORITY_EDGE[n.priority]} ${
                      isRead ? "opacity-55" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden>
                        {TYPE_ICON[n.type]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-1.5">
                          <p
                            className={`flex-1 text-[13px] leading-snug ${
                              isRead ? "text-muted" : "font-semibold text-ink"
                            }`}
                          >
                            {n.message}
                          </p>
                          {!isRead && (
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span
                            className={`text-[10.5px] font-semibold uppercase tracking-[.04em] ${TYPE_COLOR[n.type]}`}
                          >
                            {TYPE_LABEL[n.type]}
                          </span>
                          {n.priority === "critical" && (
                            <span className="text-[10.5px] font-semibold uppercase tracking-[.04em] text-red-600">
                              crítico
                            </span>
                          )}
                          <span className="ml-auto text-[10.5px] text-muted">
                            {relTime(n.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
