"use client";

/**
 * ChannelStatusSeal — o selo discreto de canal fora do ar, na Central de Atendimento.
 *
 * Substituiu a `ChannelHealthBanner` em 24/08/2026. A faixa antiga ocupava um
 * terço da tela do Sushi Cazza com três parágrafos e duas citações literais da
 * Meta, e empurrava para baixo a única linha que o atendente precisava ver:
 * *"1 sem resposta há +1080 min — cliente esperando"*.
 *
 * O aviso **não foi apagado**: mudou de tela. O texto inteiro, com a evidência
 * técnica e o botão Reconectar, vive em `/integracoes/instagram` — a tela de
 * quem conserta conexão. Aqui fica uma linha: o efeito e o caminho.
 *
 * O que este componente NÃO pode voltar a fazer:
 *  · crescer para parágrafo — quem atende cliente perde a fila de vista;
 *  · repetir mensagem de erro de provedor — dono de restaurante não conserta OAuth;
 *  · sumir quando o canal cai — trocar incômodo por cegueira é pior que o problema.
 *
 * A trava dos dois primeiros é o tipo: `ChannelSeal` não tem `detail` nem
 * `headline`, então não existe campo por onde o parágrafo técnico entre.
 */

import Link from "next/link";
import type { ChannelSeal, ChannelHealthLevel } from "@/services/channels/channelHealth";

const TONE: Record<ChannelHealthLevel, { dot: string; text: string; ring: string }> = {
  down:      { dot: "bg-red-500",   text: "text-red-700",   ring: "border-red-200 bg-red-50" },
  attention: { dot: "bg-amber-500", text: "text-amber-800", ring: "border-amber-200 bg-amber-50" },
  info:      { dot: "bg-sky-500",   text: "text-sky-800",   ring: "border-sky-200 bg-sky-50" },
};

export function ChannelStatusSeal({ seals }: { seals: ChannelSeal[] }) {
  // Lista vazia = nada a dizer. Inclui "não consegui ler a saúde": o selo some e
  // em lugar nenhum a tela conclui que o canal está bem (guardrail 1).
  if (seals.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-1.5 sm:px-4">
      {seals.map((seal, i) => {
        const tone = TONE[seal.level];
        return (
          <Link
            key={`${seal.channel}-${seal.level}-${i}`}
            href={seal.actionHref}
            role={seal.level === "info" ? undefined : "status"}
            title={`${seal.label}: ${seal.short}`}
            className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors hover:brightness-95 ${tone.ring} ${tone.text}`}
          >
            <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
            <span className="truncate">{seal.short}</span>
            <span className="shrink-0 font-semibold underline underline-offset-2">{seal.action}</span>
          </Link>
        );
      })}
    </div>
  );
}
