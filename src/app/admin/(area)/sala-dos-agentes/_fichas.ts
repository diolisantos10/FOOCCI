"use client";

/**
 * A ponta de leitura das fichas da empresa.
 *
 * Mesma costura da Sala: UMA rota, três estados obrigatórios, e o estado de erro
 * carrega o texto do servidor para quem for consertar não precisar adivinhar.
 *
 *     GET /api/admin/fichas-da-empresa  →  { fichas: FichaNaTela[] }
 *
 * ── O 401 TEM ESTADO PRÓPRIO, E ELE É O CASO NORMAL ──
 *
 * Esta rota exige sessão interna (ADR-003) e, enquanto ninguém tiver login,
 * responde 401 para todo mundo — inclusive para o proprietário. Isso não é
 * defeito, é a porta funcionando. Tratar esse 401 como "erro" faria a tela
 * gritar vermelho num estado esperado, e a mensagem certa ("crie seu acesso")
 * ficaria escondida atrás de um "Tentar de novo" que não resolveria nada.
 */

import { useCallback, useEffect, useState } from "react";

export const ROTA_FICHAS = "/api/admin/fichas-da-empresa";

export interface FichaNaTela {
  slug: string;
  nome: string;
  catalogNumber: string | null;
  executionMode: "AI" | "HUMAN" | "HYBRID";
  departamento: { numero: number; slug: string; nome: string } | null;
  dono: { slug: string; titulo: string; ocupante: string | null } | null;
  status: string;
  isRuntimeEnabled: boolean;
  pode: string[];
  naoPode: string[];
  escalaQuando: string[];
}

export type EstadoDasFichas =
  | { fase: "carregando" }
  | { fase: "pronto"; fichas: FichaNaTela[] }
  | { fase: "semAcesso" }
  | { fase: "erro"; detalhe: string | null };

export function useFichasDaEmpresa(): {
  estado: EstadoDasFichas;
  recarregar: () => void;
} {
  const [estado, setEstado] = useState<EstadoDasFichas>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  const recarregar = useCallback(() => {
    setEstado({ fase: "carregando" });
    setTentativa((t) => t + 1);
  }, []);

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        const res = await fetch(ROTA_FICHAS, { cache: "no-store" });

        if (res.status === 401 || res.status === 403) {
          if (vivo) setEstado({ fase: "semAcesso" });
          return;
        }

        if (!res.ok) {
          let detalhe = `${ROTA_FICHAS} respondeu ${res.status}`;
          try {
            const corpo = (await res.json()) as { error?: string };
            if (corpo?.error) detalhe = corpo.error;
          } catch {
            // Corpo ilegível não muda o fato de a rota ter falhado.
          }
          if (vivo) setEstado({ fase: "erro", detalhe });
          return;
        }

        const corpo = (await res.json()) as { data?: { fichas?: unknown } };
        const fichas = corpo?.data?.fichas;

        if (!Array.isArray(fichas)) {
          if (vivo) {
            setEstado({
              fase: "erro",
              detalhe: `${ROTA_FICHAS} respondeu num formato inesperado`,
            });
          }
          return;
        }

        if (vivo) setEstado({ fase: "pronto", fichas: fichas as FichaNaTela[] });
      } catch (e) {
        if (vivo) setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : null });
      }
    })();

    return () => {
      vivo = false;
    };
  }, [tentativa]);

  return { estado, recarregar };
}

/** Rótulo do modo, em português e sem sigla. */
export function modoLegivel(modo: FichaNaTela["executionMode"]): string {
  if (modo === "AI") return "IA";
  if (modo === "HUMAN") return "Pessoa";
  return "IA com pessoa no comando";
}

/**
 * Agrupa por departamento, preservando a ordem canônica (1 a 9).
 *
 * Ficha sem departamento vai para o fim, num grupo próprio — em vez de sumir.
 * Uma ficha órfã é informação: significa que o departamento dela foi apagado.
 */
export function porDepartamento(
  fichas: FichaNaTela[],
): Array<{ numero: number | null; nome: string; fichas: FichaNaTela[] }> {
  const grupos = new Map<number | null, { nome: string; fichas: FichaNaTela[] }>();

  for (const f of fichas) {
    const chave = f.departamento?.numero ?? null;
    const nome = f.departamento?.nome ?? "Sem departamento";
    const grupo = grupos.get(chave) ?? { nome, fichas: [] };
    grupo.fichas.push(f);
    grupos.set(chave, grupo);
  }

  return [...grupos.entries()]
    .sort((a, b) => (a[0] ?? 999) - (b[0] ?? 999))
    .map(([numero, g]) => ({ numero, nome: g.nome, fichas: g.fichas }));
}
