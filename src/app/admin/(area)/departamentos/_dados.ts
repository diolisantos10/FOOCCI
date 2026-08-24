"use client";

/**
 * A ponta de leitura da área de Departamentos e Agentes.
 *
 * Três estados obrigatórios, e um quarto que é o caso normal hoje.
 *
 * ── O 401 TEM ESTADO PRÓPRIO ──
 *
 * Esta rota exige sessão interna (ADR-003) e, enquanto ninguém tiver login,
 * responde 401 para todo mundo — inclusive para o proprietário. Isso não é
 * defeito: é a porta funcionando. Tratar como "erro" faria a tela gritar
 * vermelho num estado esperado, e a mensagem certa ("crie seu acesso") ficaria
 * escondida atrás de um "Tentar de novo" que não resolveria nada.
 */

import { useCallback, useEffect, useState } from "react";
import type { PainelDeDepartamentos } from "@/services/organizacao/painelDeDepartamentos";

export const ROTA_PAINEL = "/api/admin/departamentos";

export type EstadoDoPainel =
  | { fase: "carregando" }
  | { fase: "pronto"; painel: PainelDeDepartamentos }
  | { fase: "semAcesso" }
  | { fase: "erro"; detalhe: string | null };

export function usePainelDeDepartamentos(): {
  estado: EstadoDoPainel;
  recarregar: () => void;
} {
  const [estado, setEstado] = useState<EstadoDoPainel>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  const recarregar = useCallback(() => {
    setEstado({ fase: "carregando" });
    setTentativa((t) => t + 1);
  }, []);

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        const res = await fetch(ROTA_PAINEL, { cache: "no-store" });

        if (res.status === 401 || res.status === 403) {
          if (vivo) setEstado({ fase: "semAcesso" });
          return;
        }

        if (!res.ok) {
          let detalhe = `${ROTA_PAINEL} respondeu ${res.status}`;
          try {
            const corpo = (await res.json()) as { error?: string };
            if (corpo?.error) detalhe = corpo.error;
          } catch {
            // Corpo ilegível não muda o fato de a rota ter falhado.
          }
          if (vivo) setEstado({ fase: "erro", detalhe });
          return;
        }

        const corpo = (await res.json()) as { data?: PainelDeDepartamentos };
        const painel = corpo?.data;

        if (!painel || !Array.isArray(painel.departamentos)) {
          if (vivo) {
            setEstado({ fase: "erro", detalhe: `${ROTA_PAINEL} respondeu num formato inesperado` });
          }
          return;
        }

        if (vivo) setEstado({ fase: "pronto", painel });
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
export function modoLegivel(modo: "AI" | "HUMAN" | "HYBRID"): string {
  if (modo === "AI") return "IA";
  if (modo === "HUMAN") return "Pessoa";
  return "IA com pessoa";
}
