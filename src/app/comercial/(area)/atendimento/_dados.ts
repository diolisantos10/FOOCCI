"use client";

/**
 * A ponta de leitura da Central de Atendimento (tela 03).
 *
 * Mesma doutrina das outras: quatro fases, e "sem acesso" é caso normal enquanto
 * ninguém tiver login interno — tratá-lo como erro faria a tela gritar vermelho
 * num estado esperado.
 *
 * ⛔ Nenhuma das funções daqui envia mensagem. As que escrevem mexem em DONO
 * (`/responsavel`, `/distribuicao`), em PRIORIDADE (`/prioridade`) e em ETAPA
 * (`/funil`) — e cada uma usa a rota que já carrega as travas do seu ato.
 */

import { useCallback, useEffect, useState } from "react";
import type { CentralDeConversas } from "@/services/salaDeVendas/caixasDeConversa";

export const ROTA_CENTRAL = "/api/admin/sala-de-vendas/central-de-conversas";
export const ROTA_DISTRIBUICAO = "/api/admin/sala-de-vendas/distribuicao";
export const ROTA_PRIORIDADE = "/api/admin/sala-de-vendas/prioridade";
export const ROTA_ABORDAGEM = "/api/admin/sala-de-vendas/abordagem";

export type EstadoDaCentral =
  | { fase: "carregando" }
  | { fase: "pronto"; dados: CentralDeConversas }
  | { fase: "semAcesso" }
  | { fase: "erro"; detalhe: string | null };

export function useCentralDeConversas(params: {
  caixa: string;
  canal: string | null;
  busca: string;
  ordem: "recentes" | "antigas";
}) {
  const [estado, setEstado] = useState<EstadoDaCentral>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);

  const { caixa, canal, busca, ordem } = params;

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        const q = new URLSearchParams({ caixa, ordem });
        if (canal) q.set("canal", canal);
        if (busca.trim()) q.set("busca", busca.trim());

        const r = await fetch(`${ROTA_CENTRAL}?${q.toString()}`, { cache: "no-store" });
        if (!vivo) return;

        if (r.status === 401 || r.status === 403) {
          setEstado({ fase: "semAcesso" });
          return;
        }

        const j = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          data?: CentralDeConversas;
          error?: string;
        };
        if (!vivo) return;

        if (!r.ok || !j.ok || !j.data) {
          setEstado({ fase: "erro", detalhe: j.error ?? `A central respondeu ${r.status}.` });
          return;
        }

        setEstado({ fase: "pronto", dados: j.data });
      } catch (e) {
        if (vivo) setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : null });
      }
    })();

    return () => {
      vivo = false;
    };
  }, [caixa, canal, busca, ordem, tentativa]);

  return { estado, recarregar };
}

export type ResultadoDaCentral = { ok: true; aviso?: string } | { ok: false; mensagem: string };

async function enviar(rota: string, corpo: unknown): Promise<ResultadoDaCentral> {
  try {
    const r = await fetch(rota, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });

    const j = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      motivo?: string;
      data?: { aviso?: string };
    };

    if (r.ok && j.ok) return { ok: true, aviso: j.data?.aviso };

    // O motivo vem em campo separado nas rotas que recusam por trava (ritmo,
    // janela, opt-out). Ele é a frase que explica o "não" — sem ela, quem está
    // atendendo tenta de novo, que é a pior reação a um teto.
    return {
      ok: false,
      mensagem: j.motivo ?? j.error ?? `Não foi possível concluir (HTTP ${r.status}).`,
    };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : "Falha de rede." };
  }
}

/** Passa a conversa para outra pessoa. Exige ser o dono — a trava é do serviço. */
export const transferirConversa = (corpo: {
  leadId: string;
  paraUserId: string;
  motivo?: string;
}) => enviar(ROTA_DISTRIBUICAO, { ...corpo, acao: "transferir" });

/** Liga e desliga a prioridade. Uma coluna, e só ela — ver a rota. */
export const marcarPrioridade = (corpo: { leadId: string; prioritario: boolean }) =>
  enviar(ROTA_PRIORIDADE, corpo);

/** Manda o modelo aprovado pela Meta, quando a janela de 24 h está fechada. */
export const enviarModeloAprovado = (leadId: string) => enviar(ROTA_ABORDAGEM, { leadId });

/** "há 3 min", "há 2 h". Relógio do navegador — é a tela de quem está olhando. */
export function quando(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const min = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  if (min < 1440) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
