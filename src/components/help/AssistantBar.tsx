"use client";

/**
 * AssistantBar — o Assistente Foocci mora no TOPO do painel, não num balãozinho
 * de canto. Referência de interface aprovada pelo CEO em 04/08 (HostGator
 * "Gator 2.0"), adaptada aos tokens do Foocci.
 *
 * Três superfícies, uma barra:
 *   • fechada   — a barra "Como posso te ajudar?" (+ atalhos no desktop, sino);
 *   • sugestões — ações rápidas, dúvidas DESTA tela e a trilha de primeiros passos;
 *   • conversa  — janela encaixada à direita, expansível para tela cheia, com
 *                 minimizar / expandir / fechar.
 *
 * As três abas antigas do balãozinho não sumiram: viraram MODOS da conversa
 * (Assistente · Diagnóstico · Avisos), alcançáveis pelo seletor, pelo sino da
 * barra e pelas ações rápidas.
 *
 * A altura da barra é publicada em `--assistant-bar` (globals.css) porque telas
 * de altura fixa (Pedidos, Central de Conversas) precisam descontá-la. Medida que
 * uma tela precisa saber de outra vira token, nunca número repetido.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useSidebar } from "@/components/layout/SidebarContext";
import {
  BAR_QUICK_ACTION_IDS,
  ONBOARDING_KEY,
  QUICK_ACTIONS,
  guideForPath,
  type QuickAction,
} from "./assistantCatalog";
import { HELP_OPEN_EVENT, type HelpOpenDetail } from "./events";
import { useNotifications, type NotificationItem } from "./useNotifications";
import { useHelpThread } from "./useHelpThread";
import { useVoiceInput } from "./useVoiceInput";
import AssistantPanel from "./AssistantPanel";
import AssistantChat, { AI_DISCLAIMER } from "./AssistantChat";
import AssistantNotifications from "./AssistantNotifications";
import SupportTechChat from "./SupportTechChat";
import {
  BellIcon,
  CloseIcon,
  CollapseIcon,
  ExpandIcon,
  MicIcon,
  MinimizeIcon,
  RefreshIcon,
  SendIcon,
  SparkIcon,
} from "./icons";

type Surface = "closed" | "suggest" | "chat";
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

function isPhone(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
}

export function AssistantBar() {
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

  const anchorRef = useRef<HTMLDivElement>(null);
  const barInputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);

  const voice = useVoiceInput((text) => setDraft((d) => (d ? `${d} ${text}` : text)));

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
    barInputRef.current?.blur();
    sheetInputRef.current?.blur();
  }, []);

  const send = helper.send;
  const ask = useCallback(
    async (question: string) => {
      openChat("assistente");
      setDraft("");
      await send(question);
    },
    [openChat, send],
  );

  const runQuickAction = useCallback(
    (action: QuickAction) => {
      if (action.kind === "ask") {
        void ask(action.question);
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

  // ── Clique fora fecha só o painel de sugestões ──────────────────────────────
  useEffect(() => {
    if (surface !== "suggest") return;
    function onDown(e: MouseEvent) {
      if (!anchorRef.current?.contains(e.target as Node)) closeAll();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [surface, closeAll]);

  function submitBar(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) {
      openSuggest();
      barInputRef.current?.focus();
      return;
    }
    void ask(text);
  }

  function openNotification(n: NotificationItem) {
    notif.markRead(n.id);
    closeAll();
    router.push(n.href);
  }

  const barChips = BAR_QUICK_ACTION_IDS.map((id) =>
    QUICK_ACTIONS.find((a) => a.id === id),
  ).filter((a): a is QuickAction => Boolean(a));

  const hasConversation = helper.messages.some((m) => m.role === "USER");
  // O nome do lojista aparece na SAUDAÇÃO da conversa, não no placeholder:
  // a 375px "Como posso te ajudar, Proprietário?" era cortado no meio.
  const placeholder = "Como posso te ajudar?";

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="relative z-40 shrink-0 border-b border-line bg-paper print:hidden">
        <div className="flex h-[var(--assistant-bar)] items-center gap-2 px-4 sm:px-6">
          {/* Barra + painel de sugestões (ancorados juntos) */}
          <div ref={anchorRef} className="relative min-w-0 flex-1 sm:max-w-2xl lg:max-w-xl">
            <form
              onSubmit={submitBar}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-line2 bg-canvas pl-2.5 pr-1 transition-colors focus-within:border-brand-400 focus-within:bg-paper focus-within:ring-2 focus-within:ring-brand-100"
            >
              <SparkIcon className="h-4 w-4 shrink-0 text-brand-500" />
              <input
                ref={barInputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={() => surface === "closed" && openSuggest()}
                onPointerDown={(e) => {
                  // No celular a folha traz o próprio campo (ao alcance do polegar):
                  // não deixamos o teclado subir por trás dela.
                  if (isPhone()) {
                    e.preventDefault();
                    openSuggest();
                  }
                }}
                placeholder={placeholder}
                aria-label="Perguntar ao assistente Foocci"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13.5px] text-ink placeholder:text-muted focus:outline-none focus:ring-0"
              />
              {voice.supported && (
                <button
                  type="button"
                  onClick={voice.toggle}
                  disabled={voice.transcribing}
                  aria-label={voice.recording ? "Parar gravação" : "Ditar por voz"}
                  title={voice.recording ? "Parar gravação" : "Ditar por voz"}
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors disabled:opacity-50 ${
                    voice.recording
                      ? "bg-red-50 text-red-600"
                      : "text-muted hover:bg-[#F4F4F2] hover:text-ink2"
                  }`}
                >
                  {voice.recording ? (
                    <span className="h-2 w-2 animate-pulse rounded-sm bg-red-500" />
                  ) : voice.transcribing ? (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-line2 border-t-brand-500" />
                  ) : (
                    <MicIcon className="h-4 w-4" />
                  )}
                </button>
              )}
              <button
                type="submit"
                aria-label="Enviar pergunta"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-500 text-white transition-colors hover:bg-brand-600"
              >
                <SendIcon className="h-3.5 w-3.5" />
              </button>
            </form>

            {surface === "suggest" && (
              <SuggestSurface
                onClose={closeAll}
                guide={guide}
                doneSteps={doneSteps}
                onToggleStep={toggleStep}
                onAsk={(q) => void ask(q)}
                onQuickAction={runQuickAction}
                trailOpen={trailOpen}
                onTrailToggle={setTrailOpen}
                unreadCount={notif.unreadCount}
                onOpenAvisos={() => openChat("avisos")}
                draft={draft}
                onDraftChange={setDraft}
                onSubmit={submitBar}
                sheetInputRef={sheetInputRef}
                voice={voice}
                placeholder={placeholder}
              />
            )}
          </div>

          {/* Atalhos dentro da própria barra — só onde sobra largura */}
          <div className="hidden items-center gap-1.5 lg:flex">
            {barChips.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => runQuickAction(a)}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-line bg-paper px-2.5 py-1.5 text-[12.5px] font-semibold text-ink2 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
              >
                <span aria-hidden>{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {minimized && (
              <button
                type="button"
                onClick={() => setMinimized(false)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-[12.5px] font-semibold text-brand-700 transition-colors hover:bg-brand-100"
              >
                <span aria-hidden>💬</span>
                <span className="hidden sm:inline">Retomar conversa</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => openChat("avisos")}
              aria-label={`Avisos da operação${notif.unreadCount > 0 ? ` (${notif.unreadCount} não lidos)` : ""}`}
              className="relative grid h-9 w-9 place-items-center rounded-xl text-muted transition-colors hover:bg-[#F4F4F2] hover:text-ink2"
            >
              <BellIcon className="h-[18px] w-[18px]" />
              {notif.unreadCount > 0 && (
                <span
                  className={`absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9.5px] font-semibold leading-none text-white ring-2 ring-paper ${
                    notif.hasCritical ? "bg-red-500" : "bg-brand-500"
                  }`}
                >
                  {notif.unreadCount > 9 ? "9+" : notif.unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Conversa ─────────────────────────────────────────────────────── */}
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
                : "sm:bottom-4 sm:left-auto sm:right-4 sm:top-[calc(var(--assistant-bar)+0.75rem)] sm:w-[420px]"
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
                onMarkAll={notif.markAllRead}
                onOpen={openNotification}
              />
            )}
          </section>
        </>
      )}
    </>
  );
}

// ── Superfície de sugestões ───────────────────────────────────────────────────

function SuggestSurface({
  onClose,
  draft,
  onDraftChange,
  onSubmit,
  sheetInputRef,
  voice,
  placeholder,
  ...panel
}: {
  onClose: () => void;
  draft: string;
  onDraftChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  sheetInputRef: React.RefObject<HTMLInputElement>;
  voice: ReturnType<typeof useVoiceInput>;
  placeholder: string;
} & React.ComponentProps<typeof AssistantPanel>) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-paper print:hidden sm:absolute sm:inset-auto sm:left-0 sm:right-0 sm:top-[calc(100%+0.9rem)] sm:max-h-[70vh] sm:rounded-2xl sm:border sm:border-line sm:shadow-2xl"
      role="dialog"
      aria-label="Sugestões do assistente"
    >
      {/* Cabeçalho — só no celular, onde a folha ocupa a tela */}
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3 sm:hidden">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <SparkIcon className="h-4 w-4" />
        </span>
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
          Como posso te ajudar?
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-[#F4F4F2] hover:text-ink2"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <AssistantPanel {...panel} />
      </div>

      {/* Campo no rodapé — celular: ao alcance do polegar */}
      <form
        onSubmit={onSubmit}
        className="shrink-0 border-t border-line bg-paper px-4 pb-3 pt-2.5 sm:hidden"
      >
        <div className="flex h-11 items-center gap-1.5 rounded-xl border border-line2 bg-canvas pl-3 pr-1.5 focus-within:border-brand-400 focus-within:bg-paper focus-within:ring-2 focus-within:ring-brand-100">
          <input
            ref={sheetInputRef}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder={placeholder}
            aria-label="Perguntar ao assistente Foocci"
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-ink placeholder:text-muted focus:outline-none focus:ring-0"
          />
          {voice.supported && (
            <button
              type="button"
              onClick={voice.toggle}
              disabled={voice.transcribing}
              aria-label={voice.recording ? "Parar gravação" : "Ditar por voz"}
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors disabled:opacity-50 ${
                voice.recording ? "bg-red-50 text-red-600" : "text-muted hover:bg-[#F4F4F2]"
              }`}
            >
              {voice.recording ? (
                <span className="h-2 w-2 animate-pulse rounded-sm bg-red-500" />
              ) : (
                <MicIcon className="h-4 w-4" />
              )}
            </button>
          )}
          <button
            type="submit"
            aria-label="Enviar pergunta"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500 text-white transition-colors hover:bg-brand-600"
          >
            <SendIcon className="h-4 w-4" />
          </button>
        </div>
        {voice.error && <p className="mt-1.5 text-[11.5px] text-red-600">{voice.error}</p>}
        <p className="mt-2 text-center text-[11px] leading-snug text-muted">{AI_DISCLAIMER}</p>
      </form>

      {/* Aviso de voz no desktop (o campo dali é o da barra) */}
      {voice.error && (
        <p className="hidden shrink-0 border-t border-line px-4 py-2 text-[11.5px] text-red-600 sm:block">
          {voice.error}
        </p>
      )}
    </div>
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
