"use client";

/**
 * AssistantChat — a conversa com o Assistente Foocci.
 *
 * É a superfície que abre a partir da pílula do cabeçalho (ver AssistantPill;
 * quem guarda o estado é o AssistantProvider, no layout do painel). Fala com
 * o backend que já existe (HelpThreadService via /api/help/*), inclusive o
 * chamado numerado que a escalada devolve.
 *
 * DESIGN.md: tokens ink/ink2/muted/line/paper/canvas + brand como único acento,
 * card rounded-2xl, input rounded-xl, pesos 400/600. Os três estados
 * obrigatórios (§6.1) estão todos aqui: carregando, vazio e erro.
 */

import { useEffect, useRef, useState } from "react";
import type { ContextGuide, QuickAction } from "./assistantCatalog";
import { SUGGESTIONS } from "./assistantCatalog";
import type { HelpChatMessage, HelpProposedAction, UseHelpThread } from "./useHelpThread";
import { Button, Card, Pill } from "@/components/ui";
import { appendTranscript, useVoiceInput, VoiceButton, VoiceStatus } from "@/components/voice";
import { SendIcon, SparkIcon } from "./icons";

export const AI_DISCLAIMER =
  "O assistente está sempre aprendendo e pode cometer erros. Confira o que for importante.";

interface Props {
  helper: UseHelpThread;
  userName: string | null;
  restaurantName: string | null;
  guide: ContextGuide | null;
  onQuickAction: (action: QuickAction) => void;
  /** Leva o lojista à tela onde ELE confirma a ação proposta. */
  onNavigate: (href: string) => void;
}

export default function AssistantChat({
  helper,
  userName,
  restaurantName,
  guide,
  onQuickAction,
  onNavigate,
}: Props) {
  const {
    messages,
    thread,
    status,
    sending,
    shouldEscalate,
    escalating,
    resetting,
    ticket,
    proposedAction,
    sendError,
    load,
    send,
    escalate,
    reset,
    dismissSendError,
  } = helper;

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // A transcrição cai no campo e a pessoa revisa antes de enviar — nunca envia
  // sozinha. Se já havia texto, acrescenta.
  const voice = useVoiceInput(
    (text) => {
      setDraft((d) => appendTranscript(d, text));
      inputRef.current?.focus();
    },
    { fileName: "pergunta.webm" },
  );

  const hasUserMessages = messages.some((m) => m.role === "USER");
  const isHuman = thread?.mode === "HUMAN";
  const firstName = (userName ?? "").trim().split(" ")[0] || null;

  // Sempre no fim da conversa quando algo novo chega.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending, shouldEscalate, ticket, proposedAction]);

  async function submit(text: string) {
    const content = text.trim();
    if (!content) return;
    setDraft("");
    const okSent = await send(content);
    if (!okSent) setDraft(content); // devolve o texto: nada se perde numa falha
  }

  const suggestions = [
    ...(guide ? [guide.question] : []),
    ...(guide?.also ?? []),
    ...SUGGESTIONS.filter((s) => s !== guide?.question),
  ].slice(0, 4);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      {/* ── Conversa ─────────────────────────────────────────────────────── */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {/* Carregando — esqueleto, nunca tela branca */}
          {status === "loading" && !hasUserMessages && <LoadingSkeleton />}

          {/* Erro — o que houve + como resolver */}
          {status === "error" && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-[13.5px] font-semibold text-red-700">
                Não consegui carregar sua conversa
              </p>
              <p className="mt-1 text-[12.5px] leading-snug text-red-600">
                Pode ser a conexão. Seu histórico está guardado — nada foi perdido.
              </p>
              <Button
                variant="secondary"
                onClick={() => void load()}
                className="mt-3 border-red-200 text-red-700 hover:bg-red-100"
              >
                Tentar de novo
              </Button>
            </div>
          )}

          {/* Vazio — saudação com o nome + o próximo passo */}
          {status !== "loading" && status !== "error" && !hasUserMessages && (
            <div className="flex flex-col gap-3">
              <Card className="p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <SparkIcon className="h-4 w-4" />
                  </span>
                  <p className="text-[15px] font-semibold text-ink">
                    {firstName ? `Oi, ${firstName}!` : "Oi!"} Sou o assistente do Foocci.
                  </p>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-ink2">
                  Conheço o manual inteiro
                  {restaurantName ? ` e os dados do ${restaurantName}` : ""} — cardápio, pedidos,
                  WhatsApp, impressora, campanhas. Pergunte com suas palavras que eu te mostro o
                  caminho. Se eu não resolver, abro um chamado com a equipe.
                </p>
              </Card>

              <div className="flex flex-col gap-1.5">
                <p className="px-1 text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
                  {guide ? `Perguntas de quem está em ${guide.label}` : "Comece por aqui"}
                </p>
                {suggestions.map((q, i) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void submit(q)}
                    className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left text-[13px] transition-colors ${
                      i === 0 && guide
                        ? "border-brand-200 bg-brand-50 font-semibold text-brand-700 hover:bg-brand-100"
                        : "border-line bg-paper text-ink2 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                    }`}
                  >
                    {i === 0 && guide && <span aria-hidden>📍</span>}
                    <span className="min-w-0 flex-1">{q}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    onQuickAction({
                      id: "diagnostico",
                      icon: "🛠️",
                      label: "Algo não funciona",
                      kind: "mode",
                      mode: "diagnostico",
                    })
                  }
                  className="mt-1 self-start text-left text-[12.5px] font-semibold text-muted underline-offset-2 transition-colors hover:text-brand-600 hover:underline"
                >
                  🛠️ Alguma coisa parou de funcionar? Ir para o diagnóstico →
                </button>
              </div>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}

          {sending && <TypingBubble />}

          {/* Ação proposta pelo agente — oferta com botão, nunca coisa já feita */}
          {proposedAction && !sending && (
            <ProposalCard action={proposedAction} onGo={onNavigate} />
          )}

          {/* O chamado numerado que a escalada devolveu */}
          {ticket && <TicketCard code={ticket.code} notified={ticket.notified} />}

          {/* O agente disse que não resolve sozinho — oferecemos o chamado */}
          {shouldEscalate && !isHuman && !ticket && (
            <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
              <p className="text-[13.5px] font-semibold text-brand-700">
                Isso eu não resolvo sozinho.
              </p>
              <p className="mt-1 text-[12.5px] leading-snug text-ink2">
                Posso abrir um chamado com a equipe Foocci levando esta conversa inteira como
                evidência — você recebe o número na hora.
              </p>
              <Button
                variant="primary"
                onClick={() => void escalate()}
                disabled={escalating}
                className="mt-3"
              >
                {escalating ? "Abrindo chamado…" : "Abrir chamado com a equipe"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Rodapé: estado da conversa ───────────────────────────────────── */}
      {isHuman && (
        <div className="shrink-0 border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-[12px] text-amber-800">
          Você está falando com a equipe Foocci — responderemos por aqui.{" "}
          <button
            type="button"
            onClick={() => void reset()}
            disabled={resetting}
            className="font-semibold text-brand-600 underline-offset-2 transition-colors hover:underline disabled:opacity-50"
          >
            Voltar ao assistente
          </button>
        </div>
      )}

      {!isHuman && hasUserMessages && !shouldEscalate && !ticket && (
        <div className="shrink-0 border-t border-line bg-paper px-4 pt-2 text-center">
          <button
            type="button"
            onClick={() => void escalate()}
            disabled={escalating}
            className="text-[12px] text-muted underline-offset-2 transition-colors hover:text-brand-600 hover:underline disabled:opacity-50"
          >
            {escalating ? "Abrindo chamado…" : "Não resolveu? Abrir chamado com a equipe Foocci →"}
          </button>
        </div>
      )}

      {/* ── Erro de envio ────────────────────────────────────────────────── */}
      {sendError && (
        <div className="shrink-0 border-t border-red-200 bg-red-50 px-4 py-2">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
            <p className="min-w-0 flex-1 text-[12px] text-red-700">{sendError}</p>
            {draft.trim() && (
              <button
                type="button"
                onClick={() => void submit(draft)}
                className="shrink-0 rounded-lg border border-red-200 bg-paper px-2.5 py-1 text-[12px] font-semibold text-red-700 transition-colors hover:bg-red-100"
              >
                Tentar de novo
              </button>
            )}
            <button
              type="button"
              onClick={dismissSendError}
              aria-label="Dispensar aviso"
              className="shrink-0 rounded-lg px-1.5 py-1 text-[12px] font-semibold text-red-600 transition-colors hover:bg-red-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Campo de escrita ─────────────────────────────────────────────── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(draft);
        }}
        className="shrink-0 border-t border-line bg-paper px-4 pb-3 pt-3 sm:px-5"
      >
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border border-line2 bg-canvas px-2 py-1.5 transition-colors focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit(draft);
                }
              }}
              rows={1}
              placeholder={
                isHuman ? "Escreva para a equipe Foocci…" : "Pergunte qualquer coisa…"
              }
              className="max-h-32 min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-[14px] leading-snug text-ink placeholder:text-muted focus:outline-none focus:!ring-0"
            />
            <VoiceButton voice={voice} label="Ditar a pergunta por voz" />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              aria-label="Enviar"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500 text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] transition-colors hover:bg-brand-600 disabled:opacity-40 disabled:shadow-none"
            >
              <SendIcon className="h-4 w-4" />
            </button>
          </div>
          <VoiceStatus voice={voice} />
          <p className="mt-2 text-center text-[11px] leading-snug text-muted">{AI_DISCLAIMER}</p>
        </div>
      </form>
    </div>
  );
}

// ── Peças ─────────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-label="Carregando conversa">
      <div className="h-16 w-3/4 animate-pulse rounded-2xl bg-line2" />
      <div className="h-10 w-1/2 animate-pulse self-end rounded-2xl bg-line2" />
      <div className="h-20 w-4/5 animate-pulse rounded-2xl bg-line2" />
    </div>
  );
}

function MessageBubble({ message }: { message: HelpChatMessage }) {
  const [copied, setCopied] = useState(false);

  if (message.role === "SYSTEM") {
    return (
      <p className="mx-auto max-w-[90%] rounded-full bg-line/70 px-3.5 py-1.5 text-center text-[12px] text-ink2">
        {message.content}
      </p>
    );
  }

  const isUser = message.role === "USER";
  const isSupport = message.role === "SUPPORT";

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // navegador sem clipboard — o texto continua selecionável
    }
  }

  return (
    <div className={`group flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      {isSupport && (
        <span className="mb-1 px-1 text-[10.5px] font-semibold uppercase tracking-[.04em] text-brand-600">
          {message.authorName || "Equipe Foocci"}
        </span>
      )}
      <div
        className={`max-w-[92%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed sm:max-w-[85%] ${
          isUser
            ? "rounded-br-md bg-brand-500 text-white"
            : isSupport
              ? "rounded-bl-md border border-brand-100 bg-brand-50 text-ink"
              : "rounded-bl-md border border-line bg-paper text-ink shadow-[0_1px_2px_rgba(11,11,11,.03)]"
        }`}
      >
        {message.content}
      </div>
      {!isUser && (
        <button
          type="button"
          onClick={() => void copy()}
          className="mt-1 px-1 text-[11px] text-muted transition-colors hover:text-ink2"
        >
          {copied ? "✓ copiado" : "Copiar resposta"}
        </button>
      )}
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start" aria-label="O assistente está escrevendo">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-line bg-paper px-4 py-3.5">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
      style={{ animationDelay: delay }}
    />
  );
}

function ProposalCard({
  action,
  onGo,
}: {
  action: HelpProposedAction;
  onGo: (href: string) => void;
}) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[.06em] text-muted">
        Posso te levar lá
      </p>
      <p className="mt-1.5 text-[13.5px] font-semibold leading-snug text-ink">{action.offer}</p>
      <Button variant="primary" onClick={() => onGo(action.cta.href)} className="mt-3">
        {action.cta.label}
      </Button>
      <p className="mt-2 text-[11.5px] leading-snug text-muted">
        Nada é feito sem você: {action.humanConfirms}
      </p>
    </Card>
  );
}

function TicketCard({ code, notified }: { code: string; notified: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="brand">Chamado {code}</Pill>
        <Pill tone={notified ? "green" : "amber"}>
          {notified ? "Equipe avisada" : "Registrado — aviso pendente"}
        </Pill>
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-ink2">
        {notified
          ? "A equipe Foocci recebeu a conversa inteira como evidência. A resposta chega por aqui mesmo."
          : "O chamado está registrado com a conversa como evidência. O aviso por e-mail falhou, mas ele não se perde."}
      </p>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
        className="mt-2 text-[12px] font-semibold text-brand-600 underline-offset-2 transition-colors hover:underline"
      >
        {copied ? "✓ número copiado" : "Copiar número do chamado"}
      </button>
    </Card>
  );
}
