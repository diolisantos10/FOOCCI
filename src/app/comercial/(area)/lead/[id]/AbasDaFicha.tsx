"use client";

/**
 * AS SEIS ABAS DO CRM 360 — Resumo · Histórico · Compras · Conversas · Tags ·
 * Atividades, como a peça 04 do desenho as mostra.
 *
 * ── POR QUE ELA É O ÚNICO PEDAÇO "use client" DESTA TELA ────────────────────
 *
 * `Crm360View` é componente PURO de propósito: é o que permite ao teste medir o
 * HTML que o vendedor recebe, com dado saído do serviço de verdade. Trocar de
 * aba é estado de navegador e não pode contaminar aquilo.
 *
 * Então a fronteira é aqui: o servidor monta os seis painéis já renderizados e
 * os entrega prontos; este componente só escolhe qual mostrar. Nenhum dado
 * atravessa a fronteira — só elementos já formados.
 *
 * ── E TODAS AS SEIS FICAM NO HTML ───────────────────────────────────────────
 *
 * As abas inativas são escondidas com `hidden`, não descartadas. Duas razões,
 * e as duas valem: a busca do navegador (Ctrl+F) acha o que está na aba ao
 * lado, e quem lê por leitor de tela não perde o conteúdo. O custo é HTML
 * maior; a ficha de um lead cabe.
 */

import { useState } from "react";
import { Icone, cx, type NomeDeIcone } from "../../_pecas/Pecas";

export interface AbaDaFicha {
  id: string;
  rotulo: string;
  icone: NomeDeIcone;
  /**
   * Quantos itens a aba tem, quando o número ajuda a decidir se vale abrir.
   *
   * ⚠️ Zero **não** vira pastilha. Um "0" no alto da aba diz "medimos e deu
   * nada", quando o que a aba tem por dentro é a frase que explica o vazio —
   * e é a frase que manda alguém ir fazer alguma coisa. A trava da casa
   * (`crm360.test.ts`) recusa `>0<` na ficha inteira, por este motivo.
   */
  contagem?: number;
  conteudo: React.ReactNode;
}

export function AbasDaFicha({ abas }: { abas: AbaDaFicha[] }) {
  const [ativa, setAtiva] = useState(abas[0]?.id ?? "");

  return (
    <div className="mt-5">
      {/* A barra das abas. Rola na horizontal no celular em vez de quebrar em
          duas linhas — seis abas empilhadas empurrariam o conteúdo para fora. */}
      <div
        role="tablist"
        aria-label="Seções da ficha do lead"
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1"
      >
        {abas.map((a) => {
          const aceso = a.id === ativa;
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              id={`aba-${a.id}`}
              aria-selected={aceso}
              aria-controls={`painel-${a.id}`}
              onClick={() => setAtiva(a.id)}
              className={cx(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
                aceso
                  ? "border-brand-500 text-brand-600"
                  : "border-transparent text-muted hover:text-ink2",
              )}
            >
              <Icone nome={a.icone} className="h-4 w-4" />
              {a.rotulo}
              {typeof a.contagem === "number" && a.contagem > 0 && (
                <span
                  className={cx(
                    "rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums",
                    aceso ? "bg-brand-50 text-brand-700" : "bg-chip text-muted",
                  )}
                >
                  {a.contagem}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {abas.map((a) => (
        <div
          key={a.id}
          role="tabpanel"
          id={`painel-${a.id}`}
          aria-labelledby={`aba-${a.id}`}
          hidden={a.id !== ativa}
        >
          {a.conteudo}
        </div>
      ))}
    </div>
  );
}

/**
 * O TELEFONE COPIÁVEL do desenho.
 *
 * ⚠️ O botão só aparece quando a área de transferência existe. Num contexto sem
 * `navigator.clipboard` (http sem TLS, navegador antigo) ele some em vez de
 * falhar em silêncio — botão que não copia ensina a pessoa a achar que copiou.
 */
export function TelefoneCopiavel({ numero }: { numero: string }) {
  const [copiado, setCopiado] = useState(false);
  const [podeCopiar] = useState(
    () => typeof navigator !== "undefined" && Boolean(navigator.clipboard),
  );

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular-nums">{numero}</span>
      {podeCopiar && (
        <button
          type="button"
          aria-label={`Copiar o telefone ${numero}`}
          onClick={() => {
            void navigator.clipboard.writeText(numero).then(
              () => {
                setCopiado(true);
                window.setTimeout(() => setCopiado(false), 1800);
              },
              () => setCopiado(false),
            );
          }}
          className="grid h-6 w-6 place-items-center rounded-md text-muted transition-colors hover:bg-canvas hover:text-ink2"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none"
            stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      )}
      {copiado && <span className="text-[11px] text-emerald-600">copiado</span>}
    </span>
  );
}
