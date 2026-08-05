"use client";

/**
 * AssistantProvider — o CÉREBRO do Assistente Foocci.
 *
 * Decisão do CEO (04/08, depois de reprovar a primeira versão): **uma barra só**.
 * O assistente não tem mais faixa própria — ele é uma PÍLULA dentro do cabeçalho
 * que o painel já tem (`TopBar`), entre o título da página e os ícones de conta.
 * Por isso o estado mora aqui, no layout, e o desenho mora no `AssistantPill`:
 *
 *   • o estado (conversa, rascunho, trilha, avisos) precisa **sobreviver à
 *     navegação** — o `TopBar` é remontado a cada rota, o provedor não;
 *   • a conversa em tela cheia também é renderizada aqui, porque é `fixed` e não
 *     depende de âncora;
 *   • o painel de sugestões é renderizado pela pílula, porque ele abre **para
 *     baixo, ancorado nela**.
 *
 * A conversa em si (cabeçalho, modos, corpo) não mudou — foi o formato aprovado.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useSidebar } from "@/components/layout/SidebarContext";
import {
  ONBOARDING_KEY,
  guideForPath,
  type ContextGuide,
  type QuickAction,
} from "./assistantCatalog";
import { HELP_OPEN_EVENT, type HelpOpenDetail } from "./events";
import { useNotifications, type NotificationItem, type UseNotifications } from "./useNotifications";
import { useHelpThread, type UseHelpThread } from "./useHelpThread";
import { appendTranscript, useVoiceInput, type UseVoiceInput } from "@/components/voice";
import AssistantChat from "./AssistantChat";
import AssistantNotifications from "./AssistantNotifications";
import SupportTechChat from "./SupportTechChat";
import {
  CloseIcon,
  CollapseIcon,
  ExpandIcon,
  MinimizeIcon,
  RefreshIcon,
  SparkIcon,
} from "./icons";

export type AssistantMode = "assistente" | "diagnostico" | "avisos";

const MODES: Array<{ id: AssistantMode; icon: string; label: string }> = [
  { id: "assistente", icon: "💬", label: "Assistente" },
  { id: "diagnostico", icon: "🛠️", label: "Diagnóstico" },
  { id: "avisos", icon: "🔔", label: "Avisos" },
];

const MODE_SUBTITLE: Record<AssistantMode, string> = {
  assistente: "Dúvidas, onboarding e chamados",
  diagnostico: "Sinais do sistema e o que fazer",
  avisos: "O que está acontecendo agora",
};

/** O placeholder é curto de propósito: a 375px o nome do lojista era cortado. */
export const ASSISTANT_PLACEHOLDER = "Como posso te ajudar?";

interface AssistantContextValue {
  /** `true` só quando o painel de sugestões está aberto (a pílula fica acesa). */
  suggestOpen: boolean;
  /** A conversa existe e está encolhida — a pílula vira "Retomar conversa". */
  minimized: boolean;
  guide: ContextGuide | null;
  draft: string;
  setDraft: (v: string) => void;
  doneSteps: Set<string>;
  toggleStep: (id: string) => void;
  trailOpen: boolean;
  setTrailOpen: (open: boolean) => void;
  notif: UseNotifications;
  voice: UseVoiceInput;
  openSuggest: () => void;
  openChat: (mode?: AssistantMode) => void;
  closeAll: () => void;
  restoreChat: () => void;
  ask: (question: string) => void;
  runQuickAction: (action: QuickAction) => void;
  submitDraft: () => void;
}

const AssistantCtx = createContext<AssistantContextValue | null>(null);

export function useAssistant(): AssistantContextValue | null {
  return useContext(AssistantCtx);
}

type Surface = "closed" | "suggest" | "chat";

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const { restaurant, close: closeSidebar } = useSidebar();

  const guide = guideForPath(pathname);
  const notif = useNotifications();
  const helper = useHelpThread();

  const [surface, setSurface] = useState<Surface>("closed");
  const [mode, setMode] = useState<AssistantMode>("assistente");
  const [expanded, setExpanded] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [draft, setDraft] = useState("");
  // A trilha começa fechada (o painel termina limpo); o cartão com a barra de
  // progresso "0 de 8" é o convite, e as ações rápidas abrem ela direto.
  const [trailOpen, setTrailOpen] = useState(false);
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set());

  // Transcrição acrescenta ao rascunho e espera a pessoa apertar enviar.
  const voice = useVoiceInput((text) => setDraft((d) => appendTranscript(d, text)), {
    fileName: "pergunta.webm",
  });

  const userName = session?.user?.name ?? null;

  // ── Trilha de primeiros passos (por navegador) ──────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ONBOARDING_KEY);
      if (raw) setDoneSteps(new Set(JSON.parse(raw) as string[]));
    } catch {
      // storage indisponível — a trilha só perde a memória, não quebra
    }
  }, []);

  const toggleStep = useCallback((id: string) => {
    setDoneSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(ONBOARDING_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // ── Abrir / fechar ──────────────────────────────────────────────────────────
  const load = helper.load;

  const openSuggest = useCallback(() => {
    closeSidebar();
    setMinimized(false);
    setSurface((s) => (s === "chat" ? s : "suggest"));
    void load();
  }, [closeSidebar, load]);

  const openChat = useCallback(
    (next: AssistantMode = "assistente") => {
      closeSidebar();
      setMode(next);
      setMinimized(false);
      setSurface("chat");
      if (next === "assistente") void load();
    },
    [closeSidebar, load],
  );

  const closeAll = useCallback(() => {
    setSurface("closed");
    setMinimized(false);
  }, []);

  const restoreChat = useCallback(() => {
    setMinimized(false);
    setSurface("chat");
  }, []);

  const send = helper.send;
  const ask = useCallback(
    (question: string) => {
      openChat("assistente");
      setDraft("");
      void send(question);
    },
    [openChat, send],
  );

  const submitDraft = useCallback(() => {
    const text = draft.trim();
    if (!text) {
      openSuggest();
      return;
    }
    ask(text);
  }, [draft, ask, openSuggest]);

  const runQuickAction = useCallback(
    (action: QuickAction) => {
      if (action.kind === "ask") {
        ask(action.question);
        return;
      }
      if (action.kind === "mode") {
        openChat(action.mode);
        return;
      }
      // trilha
      setTrailOpen(true);
      openSuggest();
    },
    [ask, openChat, openSuggest],
  );

  // ── Evento externo (compatibilidade com openHelpWidget) ─────────────────────
  useEffect(() => {
    function onOpen(e: Event) {
      const tab = (e as CustomEvent<HelpOpenDetail>).detail?.tab ?? "ajuda";
      openChat(tab === "avisos" ? "avisos" : tab === "tecnica" ? "diagnostico" : "assistente");
    }
    window.addEventListener(HELP_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(HELP_OPEN_EVENT, onOpen);
  }, [openChat]);

  // ── Esc fecha a superfície aberta ───────────────────────────────────────────
  useEffect(() => {
    if (surface === "closed") return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (surface === "suggest") closeAll();
      else if (expanded) setExpanded(false);
      else closeAll();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [surface, expanded, closeAll]);

  function openNotification(n: NotificationItem) {
    notif.markRead(n.id);
    closeAll();
    router.push(n.href);
  }

  const hasConversation = helper.messages.some((m) => m.role === "USER");

  const value = useMemo<AssistantContextValue>(
    () => ({
      suggestOpen: surface === "suggest",
      minimized: surface === "chat" && minimized,
      guide,
      draft,
      setDraft,
      doneSteps,
      toggleStep,
      trailOpen,
      setTrailOpen,
      notif,
      voice,
      openSuggest,
      openChat,
      closeAll,
      restoreChat,
      ask,
      runQuickAction,
      submitDraft,
    }),
    [
      surface,
      minimized,
      guide,
      draft,
      doneSteps,
      toggleStep,
      trailOpen,
      notif,
      voice,
      openSuggest,
      openChat,
      closeAll,
      restoreChat,
      ask,
      runQuickAction,
      submitDraft,
    ],
  );

  return (
    <AssistantCtx.Provider value={value}>
      {children}

      {/* ── Conversa — o formato que o CEO aprovou; não mexer ─────────────── */}
      {surface === "chat" && !minimized && (
        <>
          {expanded && (
            <div
              className="fixed inset-0 z-40 hidden bg-ink/45 backdrop-blur-sm sm:block print:hidden"
              onClick={() => setExpanded(false)}
              aria-hidden
            />
          )}
          <section
            aria-label="Assistente Foocci"
            className={`fixed inset-0 z-50 flex flex-col overflow-hidden bg-paper print:hidden sm:rounded-2xl sm:border sm:border-line sm:shadow-2xl ${
              expanded
                ? "sm:inset-4 sm:mx-auto sm:max-w-5xl"
                : "sm:bottom-4 sm:left-auto sm:right-4 sm:top-[calc(var(--topbar)+0.5rem)] sm:w-[420px]"
            }`}
          >
            {/* Cabeçalho */}
            <header className="shrink-0 border-b border-line bg-paper px-3 pb-2.5 pt-2.5 sm:px-4">
              <div className="mx-auto w-full max-w-3xl">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <SparkIcon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-ink">
                      Assistente Foocci
                    </p>
                    <p className="truncate text-[11.5px] text-muted">{MODE_SUBTITLE[mode]}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {mode === "assistente" && hasConversation && (
                      <IconBtn
                        label="Começar uma conversa nova"
                        onClick={() => void helper.reset()}
                        disabled={helper.resetting}
                      >
                        <RefreshIcon className="h-4 w-4" />
                      </IconBtn>
                    )}
                    <IconBtn label="Minimizar" onClick={() => setMinimized(true)}>
                      <MinimizeIcon className="h-4 w-4" />
                    </IconBtn>
                    <span className="hidden sm:block">
                      <IconBtn
                        label={expanded ? "Recolher" : "Expandir"}
                        onClick={() => setExpanded((v) => !v)}
                      >
                        {expanded ? (
                          <CollapseIcon className="h-4 w-4" />
                        ) : (
                          <ExpandIcon className="h-4 w-4" />
                        )}
                      </IconBtn>
                    </span>
                    <IconBtn label="Fechar" onClick={closeAll}>
                      <CloseIcon className="h-4 w-4" />
                    </IconBtn>
                  </div>
                </div>

                {/* Modos — as três abas antigas, agora aqui dentro */}
                <div className="mt-2.5 flex w-full max-w-sm items-center gap-1 rounded-xl bg-[#F4F4F2] p-1">
                  {MODES.map((m) => {
                    const active = mode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMode(m.id)}
                        aria-current={active}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold transition-colors ${
                          active
                            ? "bg-paper text-ink shadow-[0_1px_2px_rgba(11,11,11,.06)]"
                            : "text-muted hover:text-ink2"
                        }`}
                      >
                        <span aria-hidden>{m.icon}</span>
                        <span className="truncate">{m.label}</span>
                        {m.id === "avisos" && notif.unreadCount > 0 && (
                          <span
                            className={`flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9.5px] font-semibold leading-none text-white ${
                              notif.hasCritical ? "bg-red-500" : "bg-brand-500"
                            }`}
                          >
                            {notif.unreadCount > 9 ? "9+" : notif.unreadCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </header>

            {/* Corpo */}
            {mode === "assistente" ? (
              <AssistantChat
                helper={helper}
                userName={userName}
                restaurantName={restaurant.name}
                guide={guide}
                onQuickAction={runQuickAction}
                onNavigate={(href) => {
                  setExpanded(false);
                  setMinimized(true);
                  router.push(href);
                }}
              />
            ) : mode === "diagnostico" ? (
              <SupportTechChat />
            ) : (
              <AssistantNotifications
                notifs={notif.notifs}
                readIds={notif.readIds}
                unreadCount={notif.unreadCount}
                hasCritical={notif.hasCritical}
                status={notif.status}
                onReload={notif.reload}
                onMarkAll={notif.markAllRead}
                onOpen={openNotification}
              />
            )}
          </section>
        </>
      )}
    </AssistantCtx.Provider>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-[#F4F4F2] hover:text-ink2 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export type { UseHelpThread };
