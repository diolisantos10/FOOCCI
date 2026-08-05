"use client";

/**
 * AssistantPill — o Assistente Foocci DENTRO do cabeçalho do painel.
 *
 * Decisão do CEO (04/08): **uma barra só**. A primeira versão criou uma faixa
 * própria acima do conteúdo e o lojista via duas réguas empilhadas. Agora a
 * pílula mora no `TopBar`, entre o título da página (esquerda) e os ícones de
 * conta (direita) — não soma altura nenhuma ao painel.
 *
 * Regras que vieram com a decisão:
 *   • compacta e discreta: ícone + "Como posso te ajudar?" + microfone, e ao lado,
 *     colado, **um único** atalho ("Suporte");
 *   • as ações rápidas saíram da barra fechada — elas vivem DENTRO do painel;
 *   • clicar abre o painel **para baixo**, ancorado na pílula: caixa de escrever
 *     no topo, ações rápidas e sugestões embaixo;
 *   • no celular a pílula é só o ícone e o painel vira folha de tela cheia com o
 *     campo no rodapé, ao alcance do polegar.
 */

import { useEffect, useRef } from "react";
import {
  ASSISTANT_PLACEHOLDER,
  useAssistant,
} from "./AssistantProvider";
import { PILL_SHORTCUT_ID, PILL_SHORTCUT_LABEL, QUICK_ACTIONS } from "./assistantCatalog";
import AssistantPanel from "./AssistantPanel";
import { AI_DISCLAIMER } from "./AssistantChat";
import { VoiceButton, VoiceStatus } from "@/components/voice";
import { CloseIcon, SendIcon, SparkIcon } from "./icons";

const shortcut = QUICK_ACTIONS.find((a) => a.id === PILL_SHORTCUT_ID) ?? null;

export function AssistantPill() {
  const a = useAssistant();
  const anchorRef = useRef<HTMLDivElement>(null);
  const deskInputRef = useRef<HTMLInputElement>(null);

  const open = a?.suggestOpen ?? false;
  const closeAll = a?.closeAll;

  // Clique fora fecha só o painel de sugestões (a conversa tem o próprio X).
  useEffect(() => {
    if (!open || !closeAll) return;
    function onDown(e: MouseEvent) {
      if (!anchorRef.current?.contains(e.target as Node)) closeAll!();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, closeAll]);

  // No desktop o cursor já cai na caixa de escrever — é ali que ele digita.
  // No celular, não: o teclado subiria por cima das ações rápidas.
  useEffect(() => {
    if (!open) return;
    if (window.matchMedia("(min-width: 640px)").matches) deskInputRef.current?.focus();
  }, [open]);

  // Sem provedor (rota fora do painel) a pílula simplesmente não existe.
  if (!a) return null;

  const { notif, voice, minimized } = a;
  const unread = notif.unreadCount;

  function onPillClick() {
    if (minimized) a!.restoreChat();
    else if (open) a!.closeAll();
    else a!.openSuggest();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    a!.submitDraft();
  }

  return (
    <div ref={anchorRef} className="relative flex min-w-0 shrink-0 justify-center">
      {/* ── A pílula ─────────────────────────────────────────────────────── */}
      <div
        className={`flex h-9 items-center rounded-full border transition-colors ${
          minimized
            ? "border-brand-200 bg-brand-50"
            : open
              ? "border-brand-400 bg-paper ring-2 ring-brand-100"
              : "border-line2 bg-canvas hover:border-line2 hover:bg-paper"
        }`}
      >
        <button
          type="button"
          onClick={onPillClick}
          aria-expanded={open}
          aria-haspopup="dialog"
          title={minimized ? "Retomar conversa com o assistente" : ASSISTANT_PLACEHOLDER}
          className="relative flex h-9 min-w-0 items-center gap-2 rounded-full pl-2.5 pr-2 sm:pr-1"
        >
          {/* O ponto de aviso senta NO ícone. Solto no meio da pílula ele parecia
              sujeira na tela — badge só se lê grudado em alguma coisa. */}
          <span className="relative shrink-0">
            <SparkIcon
              className={`h-4 w-4 ${minimized ? "text-brand-600" : "text-brand-500"}`}
            />
            {unread > 0 && (
              <span
                aria-label={`${unread} aviso${unread > 1 ? "s" : ""} não lido${unread > 1 ? "s" : ""}`}
                className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ring-2 ring-canvas ${
                  notif.hasCritical ? "bg-red-500" : "bg-brand-500"
                }`}
              />
            )}
          </span>
          <span
            className={`hidden min-w-0 truncate text-[13px] sm:block ${
              minimized ? "font-semibold text-brand-700" : "text-muted"
            }`}
          >
            {minimized ? "Retomar conversa" : ASSISTANT_PLACEHOLDER}
          </span>
        </button>

        {/* Microfone — colado dentro da pílula, só onde há largura.
            Ditar aqui abre o painel: a pessoa precisa VER o texto cair no campo. */}
        <VoiceButton
          voice={voice}
          size="sm"
          shape="round"
          label="Ditar uma dúvida por voz"
          onBeforeToggle={() => {
            if (!open) a!.openSuggest();
          }}
          className="hidden sm:grid"
        />

        {/* O ÚNICO atalho da barra fechada — o resto mora no painel */}
        {shortcut && (
          <>
            <span className="mx-1 hidden h-4 w-px shrink-0 bg-line2 lg:block" aria-hidden />
            <button
              type="button"
              onClick={() => a!.runQuickAction(shortcut)}
              className="hidden h-7 shrink-0 items-center rounded-full px-2.5 text-[12.5px] font-semibold text-ink2 transition-colors hover:bg-[#F4F4F2] hover:text-brand-700 lg:inline-flex"
            >
              {PILL_SHORTCUT_LABEL}
            </button>
          </>
        )}
        <span className="w-1 sm:w-1.5 lg:w-1" aria-hidden />
      </div>

      {/* ── O painel, abrindo PARA BAIXO ─────────────────────────────────── */}
      {/* `top` sai da pílula (h-9 centrada numa barra de 56px): 46px do fim dela
          + 1.15rem ≈ 64px — o painel nasce 8px ABAIXO da régua, nunca em cima. */}
      {open && (
        <div
          role="dialog"
          aria-label="Assistente Foocci"
          className="fixed inset-0 z-50 flex flex-col bg-paper print:hidden sm:absolute sm:inset-auto sm:left-1/2 sm:top-[calc(100%+1.15rem)] sm:max-h-[min(70vh,32rem)] sm:w-[min(26rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:border-line sm:shadow-2xl"
        >
          {/* Cabeçalho — só no celular, onde a folha ocupa a tela */}
          <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3 sm:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <SparkIcon className="h-4 w-4" />
            </span>
            <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
              {ASSISTANT_PLACEHOLDER}
            </p>
            <button
              type="button"
              onClick={a.closeAll}
              aria-label="Fechar"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-[#F4F4F2] hover:text-ink2"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Caixa de escrever NO TOPO — desktop/tablet */}
          <form
            onSubmit={onSubmit}
            className="hidden shrink-0 border-b border-line px-3 pb-3 pt-3 sm:block"
          >
            <div className="flex h-10 items-center gap-1.5 rounded-xl border border-line2 bg-canvas pl-3 pr-1.5 focus-within:border-brand-400 focus-within:bg-paper focus-within:ring-2 focus-within:ring-brand-100">
              <input
                ref={deskInputRef}
                value={a.draft}
                onChange={(e) => a.setDraft(e.target.value)}
                placeholder="Escreva sua dúvida…"
                aria-label="Perguntar ao assistente Foocci"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13.5px] text-ink placeholder:text-muted focus:outline-none focus:!ring-0"
              />
              <VoiceButton voice={voice} size="sm" label="Ditar a dúvida por voz" />
              <button
                type="submit"
                aria-label="Enviar pergunta"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-brand-500 text-white transition-colors hover:bg-brand-600"
              >
                <SendIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            <VoiceStatus voice={voice} />
          </form>

          {/* Ações rápidas + sugestões + trilha */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <AssistantPanel
              guide={a.guide}
              doneSteps={a.doneSteps}
              onToggleStep={a.toggleStep}
              onAsk={a.ask}
              onQuickAction={a.runQuickAction}
              trailOpen={a.trailOpen}
              onTrailToggle={a.setTrailOpen}
              unreadCount={unread}
              hasCritical={notif.hasCritical}
              onOpenAvisos={() => a.openChat("avisos")}
            />
          </div>

          {/* Campo no rodapé — celular: ao alcance do polegar */}
          <form
            onSubmit={onSubmit}
            className="shrink-0 border-t border-line bg-paper px-4 pb-3 pt-2.5 sm:hidden"
          >
            <div className="flex h-11 items-center gap-1.5 rounded-xl border border-line2 bg-canvas pl-3 pr-1.5 focus-within:border-brand-400 focus-within:bg-paper focus-within:ring-2 focus-within:ring-brand-100">
              <input
                value={a.draft}
                onChange={(e) => a.setDraft(e.target.value)}
                placeholder="Escreva sua dúvida…"
                aria-label="Perguntar ao assistente Foocci"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-ink placeholder:text-muted focus:outline-none focus:!ring-0"
              />
              <VoiceButton voice={voice} size="sm" label="Ditar a dúvida por voz" />
              <button
                type="submit"
                aria-label="Enviar pergunta"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-500 text-white transition-colors hover:bg-brand-600"
              >
                <SendIcon className="h-4 w-4" />
              </button>
            </div>
            <VoiceStatus voice={voice} />
            <p className="mt-2 text-center text-[11px] leading-snug text-muted">{AI_DISCLAIMER}</p>
          </form>
        </div>
      )}
    </div>
  );
}
