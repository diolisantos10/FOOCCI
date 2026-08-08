"use client";

/**
 * ChannelHealthBanner — a faixa que diz ao lojista que um canal parou.
 *
 * Existe porque a Central mostrava a MESMA tela para "o Instagram está fora do
 * ar há 15 dias" e para "hoje ninguém mandou mensagem": um vazio educado. Foi
 * assim que um canal morreu em 23/07 e ninguém viu até 07/08.
 *
 * Três coisas que esta faixa não pode deixar de fazer:
 *  · **dizer o próximo passo**, com o link — alerta sem saída vira paisagem;
 *  · **não acender para canal que o lojista nunca ligou** — quem não usa
 *    Instagram não tem canal caído, tem canal ausente (o filtro é no serviço);
 *  · **sumir calada quando não dá para ler a saúde** — nada aqui pode afirmar
 *    "está tudo bem" a partir de um dado que não temos (guardrail 1).
 *
 * Cor e texto separam "quebrado" de "atenção" de propósito: silêncio longo é
 * âmbar e vem com a ressalva de movimento baixo, porque um restaurante calmo
 * pode passar dias sem um Direct — e um alarme que mente ao contrário seria
 * pior que o selo verde que ele substitui (guardrail 5).
 */

import Link from "next/link";
import type { ChannelHealthItem, ChannelHealthLevel } from "@/services/channels/channelHealth";

const TONE: Record<ChannelHealthLevel, {
  wrap: string; icon: string; title: string; body: string; cta: string; badge: string; badgeLabel: string;
}> = {
  down: {
    wrap:  "border-red-200 bg-red-50",
    icon:  "🔴",
    title: "text-red-800",
    body:  "text-red-700",
    cta:   "bg-red-600 text-white hover:bg-red-700",
    badge: "bg-red-100 text-red-700",
    badgeLabel: "Fora do ar",
  },
  attention: {
    wrap:  "border-amber-200 bg-amber-50",
    icon:  "🟡",
    title: "text-amber-900",
    body:  "text-amber-800",
    cta:   "border border-amber-300 bg-paper text-amber-900 hover:bg-amber-100",
    badge: "bg-amber-100 text-amber-800",
    badgeLabel: "Atenção",
  },
  info: {
    wrap:  "border-sky-200 bg-sky-50",
    icon:  "ℹ️",
    title: "text-sky-900",
    body:  "text-sky-800",
    cta:   "border border-sky-300 bg-paper text-sky-900 hover:bg-sky-100",
    badge: "bg-sky-100 text-sky-800",
    badgeLabel: "Aviso",
  },
};

export function ChannelHealthBanner({ items }: { items: ChannelHealthItem[] }) {
  // Lista vazia = nada a dizer. Inclui o caso "não consegui ler a saúde": a
  // faixa some, e em lugar nenhum a tela conclui que o canal está saudável.
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-b border-line px-3 py-2 sm:px-4">
      {items.map((item, i) => {
        const tone = TONE[item.level];
        return (
          <div
            key={`${item.channel}-${item.level}-${i}`}
            role={item.level === "info" ? undefined : "alert"}
            className={`flex flex-col gap-2 rounded-2xl border p-3 sm:flex-row sm:items-center sm:gap-3 ${tone.wrap}`}
          >
            <span aria-hidden className="text-base leading-none">{tone.icon}</span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-sm font-semibold ${tone.title}`}>{item.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.badge}`}>
                  {tone.badgeLabel}
                </span>
              </div>
              <p className={`mt-0.5 text-xs leading-relaxed sm:text-sm ${tone.body}`}>{item.headline}</p>
            </div>

            {/* O próximo passo é um link de verdade, não uma frase solta. */}
            <Link
              href={item.actionHref}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-center text-xs font-semibold transition-colors ${tone.cta}`}
            >
              {item.action}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
