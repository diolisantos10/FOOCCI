"use client";

/**
 * A ponta de leitura do COPILOTO.
 *
 * ── DUAS CARGAS, E A SEGUNDA CUSTA DINHEIRO ─────────────────────────────────
 *
 * O painel de contexto (os 14 itens) vem do banco e carrega sozinho ao abrir a
 * conversa. A leitura da IA é uma chamada paga, e por isso **só sai quando o
 * vendedor pede** — `pedirLeitura()`. Abrir dez conversas para achar uma não
 * pode custar dez chamadas.
 *
 * ── AS FASES ────────────────────────────────────────────────────────────────
 *
 * Mesma doutrina de `_dados.ts`: "sem acesso" é caso normal e não erro. A
 * novidade é `falha`, que convive com `pronto`: o contexto pode estar carregado
 * e a leitura da IA ter falhado — e a tela mostra os catorze itens do mesmo
 * jeito. Um painel inteiro apagado por causa de uma chamada de modelo seria
 * perder o que já estava no banco.
 */

import { useCallback, useEffect, useState } from "react";
import type { PainelDoVendedor } from "@/services/salaDeVendas/painelDoVendedor";
import type { LeituraDoCopiloto, CausaDaFalha } from "@/services/salaDeVendas/copiloto";

export const ROTA_COPILOTO = "/api/admin/sala-de-vendas/copiloto";

export interface FalhaDaLeitura {
  causa: CausaDaFalha;
  explicacao: string;
}

export interface DadosDoCopiloto {
  painel: PainelDoVendedor;
  leitura: LeituraDoCopiloto | null;
  falha: FalhaDaLeitura | null;
}

export type EstadoDoCopiloto =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "pronto"; dados: DadosDoCopiloto; lendo: boolean }
  | { fase: "semAcesso" }
  | { fase: "erro"; detalhe: string | null };

export function useCopiloto(leadId: string | null) {
  const [estado, setEstado] = useState<EstadoDoCopiloto>({ fase: "vazio" });
  const [tentativa, setTentativa] = useState(0);
  // Sobe a cada pedido de leitura. Sem isto, pedir a leitura duas vezes na mesma
  // conversa não dispararia a segunda — o efeito não veria mudança nenhuma.
  const [pedidoDeLeitura, setPedidoDeLeitura] = useState(0);

  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);
  const pedirLeitura = useCallback(() => setPedidoDeLeitura((n) => n + 1), []);

  // Trocar de conversa zera o pedido de leitura: a leitura que o vendedor pediu
  // para o lead anterior não pode disparar sozinha no lead seguinte — seria uma
  // chamada paga que ninguém pediu, e sobre a conversa errada.
  useEffect(() => {
    setPedidoDeLeitura(0);
  }, [leadId]);

  useEffect(() => {
    if (!leadId) {
      setEstado({ fase: "vazio" });
      return;
    }

    let vivo = true;
    const comLeitura = pedidoDeLeitura > 0;

    setEstado((anterior) =>
      comLeitura && anterior.fase === "pronto"
        ? { ...anterior, lendo: true }
        : { fase: "carregando" },
    );

    (async () => {
      try {
        const endereco =
          `${ROTA_COPILOTO}?leadId=${encodeURIComponent(leadId)}` + (comLeitura ? "&ler=1" : "");
        const r = await fetch(endereco, { cache: "no-store" });
        if (!vivo) return;

        if (r.status === 401 || r.status === 403) {
          setEstado({ fase: "semAcesso" });
          return;
        }
        if (r.status === 404) {
          setEstado({ fase: "erro", detalhe: "Esta conversa não está disponível para você." });
          return;
        }

        const j = (await r.json()) as { ok: boolean; data?: DadosDoCopiloto; error?: string };
        if (!vivo) return;

        if (!j.ok || !j.data) {
          setEstado({ fase: "erro", detalhe: j.error ?? null });
          return;
        }

        setEstado({ fase: "pronto", dados: j.data, lendo: false });
      } catch (e) {
        if (vivo) setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : null });
      }
    })();

    return () => {
      vivo = false;
    };
  }, [leadId, tentativa, pedidoDeLeitura]);

  return { estado, recarregar, pedirLeitura };
}

export type ResultadoDoCopiloto =
  | { ok: true; gravados?: string[] }
  | { ok: false; mensagem: string };

async function acionar(corpo: unknown): Promise<ResultadoDoCopiloto> {
  try {
    const r = await fetch(ROTA_COPILOTO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });

    const j = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      data?: { gravados?: string[] };
      recusas?: Array<{ campo: string; motivo: string }>;
    };

    if (r.ok && j.ok) return { ok: true, gravados: j.data?.gravados };
    if (j.recusas?.length) {
      return { ok: false, mensagem: j.recusas.map((x) => x.motivo).join(" · ") };
    }
    return { ok: false, mensagem: j.error ?? `Não foi possível concluir (HTTP ${r.status}).` };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : "Falha de rede." };
  }
}

/**
 * Grava no CRM o que o copiloto leu.
 *
 * ⚠️ Repare no que NÃO está aqui: nenhuma rota de envio. Este módulo inteiro
 * fala com `/copiloto`, que não sabe mandar mensagem.
 */
export const registrarNoCrm = (corpo: {
  leadId: string;
  objecoes: string[];
  necessidade: string | null;
  proximaAcao: string | null;
}) => acionar({ ...corpo, acao: "registrarNoCrm" });

/** Devolve a conversa para o modo automático, dizendo para quê. */
export const devolverParaIA = (corpo: {
  leadId: string;
  objetivo: string;
  resumo?: string | null;
  proximaAcao?: string | null;
}) => acionar({ ...corpo, acao: "devolverParaIA" });
