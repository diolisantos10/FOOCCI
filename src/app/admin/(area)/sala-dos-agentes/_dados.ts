"use client";

/**
 * A ponta de leitura da Sala dos Agentes.
 *
 * A tela é a metade do bloco: quem monta `SalaDosAgentes` é o serviço, contra o
 * mesmo contrato (`@/services/agents/salaDosAgentes.types`). A costura entre os
 * dois é UMA rota:
 *
 *     GET /api/admin/sala-dos-agentes  →  SalaDosAgentes
 *
 * Aceita tanto o envelope da casa (`{ ok: true, data }`) quanto o objeto cru —
 * o formato do envelope não é matéria de contrato e não vale quebrar a tela por
 * causa dele.
 *
 * Enquanto a rota não existe, a tela cai no estado de ERRO com saída acionável.
 * Isso é de propósito: melhor uma tela que assume que não sabe do que uma tela
 * que inventa uma lista de agentes.
 */

import { useCallback, useEffect, useState } from "react";
import type { SalaDosAgentes } from "@/services/agents/salaDosAgentes.types";

export const ROTA_SALA = "/api/admin/sala-dos-agentes";

export type EstadoBusca =
  | { fase: "carregando" }
  | { fase: "pronto"; sala: SalaDosAgentes }
  | { fase: "erro"; detalhe: string | null };

function pareceSala(x: unknown): x is SalaDosAgentes {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<SalaDosAgentes>;
  return Array.isArray(s.agentes) && Array.isArray(s.motores);
}

export function useSalaDosAgentes(): { estado: EstadoBusca; recarregar: () => void } {
  const [estado, setEstado] = useState<EstadoBusca>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  const recarregar = useCallback(() => {
    setEstado({ fase: "carregando" });
    setTentativa((t) => t + 1);
  }, []);

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        const res = await fetch(ROTA_SALA, { cache: "no-store" });
        if (!res.ok) {
          if (vivo) setEstado({ fase: "erro", detalhe: `${ROTA_SALA} respondeu ${res.status}` });
          return;
        }
        const corpo: unknown = await res.json();
        const bruto =
          corpo && typeof corpo === "object" && "data" in (corpo as Record<string, unknown>)
            ? (corpo as Record<string, unknown>).data
            : corpo;

        if (!pareceSala(bruto)) {
          if (vivo) {
            setEstado({
              fase: "erro",
              detalhe: `${ROTA_SALA} respondeu num formato que não é o contrato SalaDosAgentes`,
            });
          }
          return;
        }
        if (vivo) {
          setEstado({
            fase: "pronto",
            sala: { agentes: bruto.agentes, motores: bruto.motores, lacunas: bruto.lacunas ?? [] },
          });
        }
      } catch (e) {
        if (vivo) {
          setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : null });
        }
      }
    })();

    return () => {
      vivo = false;
    };
  }, [tentativa]);

  return { estado, recarregar };
}

/** ISO → 01/08/2026. `null` continua `null` — a tela decide como dizer "não sei". */
export function formatarData(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
