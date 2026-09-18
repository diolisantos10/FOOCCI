"use client";

/**
 * A ponta de leitura da Sala de Vendas.
 *
 * Quatro estados: carregando, pronto, sem acesso e erro. O "sem acesso" é caso
 * normal enquanto ninguém tiver login interno — tratá-lo como erro faria a tela
 * gritar vermelho num estado esperado.
 */

import { useCallback, useEffect, useState } from "react";
import type { Fila, NomeDaFila, LeadNaFila } from "@/services/salaDeVendas/filas";

export const ROTA_FILAS = "/api/admin/sala-de-vendas/filas";
export const ROTA_RESPONSAVEL = "/api/admin/sala-de-vendas/responsavel";

export interface DadosDaSala {
  fila: NomeDaFila;
  filas: Fila[];
  contagens: Record<NomeDaFila, number>;
  leads: LeadNaFila[];
}

export type EstadoDaSala =
  | { fase: "carregando" }
  | { fase: "pronto"; dados: DadosDaSala }
  | { fase: "semAcesso" }
  | { fase: "erro"; detalhe: string | null };

/**
 * A coluna de conversas segue a mesma referência de tempo que mostra na tela:
 * último contato; para quem ainda não teve contato, a entrada do lead.
 *
 * A API mantém a ordenação operacional própria de cada fila. Aqui, na camada de
 * conversa, a decisão de UX é outra: o que acabou de acontecer precisa aparecer
 * em cima, como em uma caixa de entrada.
 */
function instanteVisivel(lead: LeadNaFila): number {
  const valor = lead.lastContactedAt ?? lead.createdAt;
  const data = valor instanceof Date ? valor : new Date(valor as unknown as string);
  const instante = data.getTime();
  return Number.isNaN(instante) ? 0 : instante;
}

export function ordenarConversasMaisRecentes(leads: LeadNaFila[]): LeadNaFila[] {
  return [...leads].sort((a, b) => instanteVisivel(b) - instanteVisivel(a));
}

export function useSalaDeVendas(fila: NomeDaFila) {
  const [estado, setEstado] = useState<EstadoDaSala>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        const params = new URLSearchParams({ fila });

        // Busca e ordenação pertencem à aba Conversas e ficam na URL para serem
        // copiáveis/recarregáveis. A Sala também usa este hook em outras telas;
        // por isso só repassamos parâmetros quando eles realmente existem.
        if (typeof window !== "undefined") {
          const daPagina = new URLSearchParams(window.location.search);
          const busca = daPagina.get("busca")?.trim();
          const ordem = daPagina.get("ordem")?.trim();
          if (busca) params.set("busca", busca);
          if (ordem) params.set("ordem", ordem);
        }

        const res = await fetch(`${ROTA_FILAS}?${params.toString()}`, { cache: "no-store" });

        if (res.status === 401 || res.status === 403) {
          if (vivo) setEstado({ fase: "semAcesso" });
          return;
        }

        if (!res.ok) {
          let detalhe = `${ROTA_FILAS} respondeu ${res.status}`;
          try {
            const corpo = (await res.json()) as { error?: string };
            if (corpo?.error) detalhe = corpo.error;
          } catch {
            // Corpo ilegível não muda o fato de a rota ter falhado.
          }
          if (vivo) setEstado({ fase: "erro", detalhe });
          return;
        }

        const corpo = (await res.json()) as { data?: DadosDaSala };
        if (!corpo?.data || !Array.isArray(corpo.data.leads)) {
          if (vivo) setEstado({ fase: "erro", detalhe: "resposta em formato inesperado" });
          return;
        }

        if (vivo) {
          setEstado({
            fase: "pronto",
            dados: {
              ...corpo.data,
              leads: ordenarConversasMaisRecentes(corpo.data.leads),
            },
          });
        }
      } catch (e) {
        if (vivo) setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : null });
      }
    })();

    return () => {
      vivo = false;
    };
  }, [fila, tentativa]);

  return { estado, recarregar };
}

export type ResultadoDaAcao =
  | { ok: true }
  | { ok: false; conflito: boolean; mensagem: string };

/**
 * Assumir, devolver ou pedir gente.
 *
 * O `409` tem tratamento próprio: perder a corrida do "assumir" não é erro, é o
 * que acontece toda vez que dois SDRs clicam junto. A tela precisa dizer
 * "Fulano assumiu primeiro" em vez de "algo deu errado".
 */
export async function mudarResponsavel(corpo: {
  acao: "assumir" | "devolver" | "pedirHumano";
  leadId: string;
  objetivo?: string;
  motivo?: string;
}): Promise<ResultadoDaAcao> {
  try {
    const res = await fetch(ROTA_RESPONSAVEL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });

    if (res.ok) return { ok: true };

    const dados = (await res.json().catch(() => ({}))) as { error?: string };
    return {
      ok: false,
      conflito: res.status === 409,
      mensagem: dados.error ?? `a rota respondeu ${res.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      conflito: false,
      mensagem: e instanceof Error ? e.message : "falha de rede",
    };
  }
}

/** Há quanto tempo, em português curto. `null` quando não dá para saber. */
export function desdeQuando(iso: string | Date | null): string | null {
  if (!iso) return null;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return null;

  const horas = (Date.now() - d.getTime()) / 3_600_000;
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 48) return `${Math.round(horas)} h`;
  return `${Math.round(horas / 24)} dias`;
}
