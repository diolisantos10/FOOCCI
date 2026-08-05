"use client";

/**
 * VoiceButton + VoiceStatus — o microfone de TODO campo de escrita do Foocci.
 *
 * Par indivisível: o botão mostra o estado, o status conta o que está
 * acontecendo (e é ele que os leitores de tela anunciam). Use os dois juntos —
 * o botão sozinho deixa quem não enxerga a bolinha vermelha sem saber que o
 * aparelho está gravando.
 *
 *   const voice = useVoiceInput((t) => setDraft((d) => appendTranscript(d, t)));
 *   ...
 *   <VoiceButton voice={voice} label="Ditar a mensagem" />
 *   <VoiceStatus voice={voice} />
 *
 * Os três estados são visíveis, nesta ordem de leitura:
 *   parado       → ícone de microfone neutro
 *   gravando     → quadrado vermelho pulsando + "Gravando… toque para parar"
 *   transcrevendo→ anel girando laranja + "Transcrevendo o que você falou…"
 *
 * DESIGN.md: tokens (ink2/muted/line2/red-*), botão `rounded-xl`, pesos 400/600,
 * acento de foco brand.
 */

import { useEffect, useState } from "react";
import type { PendingAudio, UseVoiceInput } from "./useVoiceInput";

/**
 * Deixa a pessoa OUVIR o que ela gravou antes de decidir repetir ou mandar
 * assim mesmo. A URL do blob é criada uma vez e revogada ao sair — criar no
 * meio do render vaza memória a cada re-render.
 */
function PendingAudioPlayer({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  if (!url) return null;
  return (
    <audio controls src={url} className="h-8 max-w-full" aria-label="Ouvir a gravação guardada" />
  );
}

type Size = "sm" | "md";
type Shape = "square" | "round";

const BOX: Record<Size, string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
};

/** `rounded-xl` é o raio de botão do DESIGN.md; `round` só para o que vive dentro de uma pílula. */
const RADIUS: Record<Shape, string> = {
  square: "rounded-xl",
  round: "rounded-full",
};

const GLYPH: Record<Size, { icon: string; dot: string; ring: string }> = {
  sm: { icon: "h-4 w-4", dot: "h-2 w-2", ring: "h-3 w-3" },
  md: { icon: "h-4 w-4", dot: "h-2.5 w-2.5", ring: "h-3.5 w-3.5" },
};

interface ButtonProps {
  voice: UseVoiceInput;
  /** O que o botão faz, em verbo — vira o aria-label ("Ditar a mensagem"). */
  label?: string;
  size?: Size;
  shape?: Shape;
  /** Desabilita por fora (ex.: conversa resolvida, envio em andamento). */
  disabled?: boolean;
  /** Roda antes de ligar/desligar o microfone (ex.: abrir o painel do chat). */
  onBeforeToggle?: () => void;
  className?: string;
}

export function VoiceButton({
  voice,
  label = "Ditar por voz",
  size = "md",
  shape = "square",
  disabled = false,
  onBeforeToggle,
  className = "",
}: ButtonProps) {
  // Regra que não se negocia: microfone que não grava é pior que microfone
  // nenhum. Enquanto não sabemos que o navegador grava, não desenhamos nada.
  if (!voice.supported) return null;

  const g = GLYPH[size];
  const busy = voice.transcribing;

  const aria = voice.recording
    ? "Parar a gravação e transcrever"
    : busy
      ? "Transcrevendo o áudio…"
      : label;

  return (
    <button
      type="button"
      onClick={() => {
        onBeforeToggle?.();
        voice.toggle();
      }}
      disabled={disabled || busy}
      aria-label={aria}
      aria-pressed={voice.recording}
      title={aria}
      className={`grid shrink-0 place-items-center border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-100 disabled:opacity-50 ${BOX[size]} ${RADIUS[shape]} ${
        voice.recording
          ? "border-red-200 bg-red-50 text-red-600"
          : "border-transparent text-muted hover:bg-[#F4F4F2] hover:text-ink2"
      } ${className}`}
    >
      {voice.recording ? (
        <span className={`${g.dot} animate-pulse rounded-sm bg-red-500`} />
      ) : busy ? (
        <span
          className={`${g.ring} animate-spin rounded-full border-2 border-line2 border-t-brand-500`}
        />
      ) : (
        <MicIcon className={g.icon} />
      )}
    </button>
  );
}

interface StatusProps {
  voice: UseVoiceInput;
  /** Some com o aviso quando a pessoa fecha. Default: mostra o "✕". */
  dismissible?: boolean;
  /**
   * Oferece "mandar assim mesmo" quando a transcrição não deu certo: o áudio
   * guardado vira anexo da conversa e um humano ouve. Sem isto, a única saída
   * de uma falha teimosa é a pessoa digitar tudo de novo.
   */
  onAttachPending?: (audio: PendingAudio) => void;
  className?: string;
}

function prettyBytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

/**
 * A linha que conta o que está acontecendo — e o único lugar onde o erro do
 * microfone aparece, sempre em frase que ensina o próximo passo.
 * `role="status" aria-live="polite"` é o que faz o leitor de tela anunciar
 * "Gravando" sem que ninguém precise ver a bolinha vermelha.
 *
 * Desde 05/08/2026 ele também é o lugar onde a **gravação sobrevive à falha**:
 * enquanto `voice.pendingAudio` existir, aparecem "Tentar de novo" e (quando o
 * chat oferece) "Mandar o áudio assim mesmo". Aviso vermelho que apaga o que a
 * pessoa falou é proteção mais cara que o problema (guardrail 5).
 */
export function VoiceStatus({
  voice,
  dismissible = true,
  onAttachPending,
  className = "",
}: StatusProps) {
  if (!voice.supported) return null;

  const pending = voice.pendingAudio;
  const showRecovery = Boolean(pending) && !voice.transcribing;

  return (
    <div role="status" aria-live="polite" className={className}>
      {voice.recording && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] leading-snug text-red-600">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" aria-hidden />
          Gravando… fale e toque no microfone para parar.
        </p>
      )}
      {voice.transcribing && (
        <p className="mt-1.5 text-[11.5px] leading-snug text-muted">
          Transcrevendo o que você falou…
        </p>
      )}
      {voice.error && (
        <div className="mt-1.5 rounded-xl border border-red-200 bg-red-50 px-2.5 py-2">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-red-700">{voice.error}</p>
            {dismissible && (
              <button
                type="button"
                onClick={voice.discardPending}
                aria-label="Dispensar aviso e descartar a gravação"
                className="shrink-0 rounded-lg px-1 text-[11.5px] font-semibold text-red-600 transition-colors hover:bg-red-100"
              >
                ✕
              </button>
            )}
          </div>

          {showRecovery && pending && (
            <div className="mt-2 border-t border-red-200 pt-2">
              <p className="text-[11px] leading-snug text-red-700">
                Sua gravação de {prettyBytes(pending.bytes)} está guardada aqui — nada foi perdido.
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {voice.canRetry && (
                  <button
                    type="button"
                    onClick={voice.retry}
                    className="rounded-lg border border-red-200 bg-paper px-2.5 py-1 text-[11.5px] font-semibold text-red-700 transition-colors hover:bg-red-100"
                  >
                    Tentar de novo
                  </button>
                )}
                {onAttachPending && (
                  <button
                    type="button"
                    onClick={() => onAttachPending(pending)}
                    className="rounded-lg border border-red-200 bg-paper px-2.5 py-1 text-[11.5px] font-semibold text-red-700 transition-colors hover:bg-red-100"
                  >
                    Mandar o áudio assim mesmo
                  </button>
                )}
                <PendingAudioPlayer blob={pending.blob} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Microfone — SVG à mão (o projeto não usa lucide/heroicons). */
export function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" />
    </svg>
  );
}
