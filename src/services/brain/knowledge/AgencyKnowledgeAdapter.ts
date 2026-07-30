/**
 * AgencyKnowledgeAdapter — a verdade de um cliente de agência é o BRIEFING.
 *
 * Achado no piloto ponta a ponta da Dioli (30/07/2026): a Oficina não conseguia
 * escrever UMA peça para cliente de agência. Só existia adapter de RESTAURANT,
 * então a verdade vinha vazia e o juiz do comando reprovava — corretamente —
 * com "anexe os fatos do banco, senão a IA inventa". A esteira da Dioli parava
 * na produção, sempre, para todo cliente.
 *
 * A peça que faltava já existia: a sondagem do SDR. O briefing é exatamente o
 * que a Oficina precisa — o que o cliente vende, para quem, o que o diferencia,
 * o que ele PROÍBE. Em vez de inventar uma segunda base de conhecimento para
 * agência, este adapter lê a entrevista guardada e a entrega como verdade.
 *
 * Duas consequências que valem mais que o conserto:
 *
 * 1. A corrente fecha. O que o cliente respondeu ao SDR é literalmente o que
 *    ancora a peça — não uma cópia que envelhece em outro lugar.
 *
 * 2. A trava herda o rigor da sondagem. Briefing pobre = verdade pobre =
 *    completude baixa = peça reprovada. O jeito de destravar a produção é
 *    terminar a entrevista, que é exatamente o que deveria acontecer.
 *
 * Nunca inventa: campo que o cliente não respondeu vira `missingContext`, com a
 * pergunta original, e não um valor plausível.
 */

import { prisma } from "@/lib/prisma";
import {
  avaliarSondagem,
  CAMPOS_DA_FICHA,
  CATALOGO_DE_SERVICOS,
  type EstadoDaSondagem,
} from "../oficina/Sondagem";
import type {
  BusinessKnowledgeAdapter,
  BusinessKnowledgeSnapshot,
} from "./BusinessKnowledgeContract";
import { registerKnowledgeAdapter } from "./KnowledgeAdapterRegistry";

/** `agencia::cliente` ou só `cliente` — aceita os dois jeitos de chamar. */
function sufixoDaChave(businessId: string): string {
  const i = businessId.indexOf("::");
  return i >= 0 ? businessId.slice(i + 2) : businessId;
}

async function lerEntrevista(businessId: string): Promise<EstadoDaSondagem | null> {
  const alvo = sufixoDaChave(businessId).trim().toLowerCase();
  if (!alvo) return null;

  // A chave é `agenciaId::clienteId`. Quem chama a Oficina normalmente só sabe
  // o cliente, então busca-se pelo sufixo — e o mais recente ganha, que é a
  // entrevista viva.
  const linha = await prisma.sdrEntrevista.findFirst({
    where:   { chave: { endsWith: `::${alvo}` } },
    orderBy: { updatedAt: "desc" },
    select:  { ficha: true, perguntadas: true, servicos: true },
  });
  if (!linha) return null;

  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    ficha:       obj(linha.ficha) as EstadoDaSondagem["ficha"],
    perguntadas: arr(linha.perguntadas) as string[],
    servicos:    arr(linha.servicos) as EstadoDaSondagem["servicos"],
  };
}

/** Uma resposta da ficha, só quando ela existe de verdade. */
function resposta(estado: EstadoDaSondagem, chave: string): string | null {
  const v = estado.ficha?.[chave];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (Array.isArray(v) && v.length > 0) return v.join(", ");
  return null;
}

function snapshotVazio(businessId: string, motivo: string): BusinessKnowledgeSnapshot {
  return {
    businessId,
    businessType: "AGENCY",
    truthSources: {},
    missingContext: [motivo],
    safetyNotes: ["Sem briefing não há verdade — a peça sairia genérica ou inventada."],
    snapshotAsOf: new Date().toISOString(),
    completenessScore: 0,
  };
}

/**
 * O briefing virando verdade. Puro: sem banco, sem rede.
 *
 * Separado do `getSnapshot` de propósito — a tradução é a parte que importa e
 * merece ser testável sem levantar Postgres. Quem já tem a sondagem em mãos
 * (um teste, o piloto da esteira) chama isto direto.
 */
export function snapshotDoBriefing(businessId: string, estado: EstadoDaSondagem): BusinessKnowledgeSnapshot {
  const avaliacao = avaliarSondagem(estado);

  // ── products: o que o cliente vende. É o mínimo de qualquer peça. ────────
  const products: string[] = [];
  for (const chave of ["o_que_vende", "diferencial"]) {
    const v = resposta(estado, chave);
    if (v) products.push(v);
  }

  // ── policies: o que ele PROÍBE + o que a agência combinou de entregar ────
  const policies: string[] = [];
  const proibicoes = resposta(estado, "proibicoes");
  if (proibicoes) policies.push(`PROIBIÇÕES DO CLIENTE: ${proibicoes}`);
  for (const s of estado.servicos ?? []) {
    const cat = CATALOGO_DE_SERVICOS.find((c) => c.chave === s.chave);
    const nome = cat?.nome ?? s.chave;
    const quem =
      s.origemDoInsumo === "cliente" ? "o cliente entrega o material"
      : s.origemDoInsumo === "agencia" ? "a agência produz o material"
      : s.origemDoInsumo === "misto"   ? "material misto"
      : "origem do material NÃO definida";
    policies.push(`${nome}: ${quem}`);
  }

  // ── materials: contexto de marca e de canal ──────────────────────────────
  const materials: string[] = [];
  for (const chave of ["identidade_visual", "site_e_canais", "redes_sociais", "objetivo", "datas", "regiao"]) {
    const v = resposta(estado, chave);
    if (v) materials.push(`${chave}: ${v}`);
  }

  // ── customers: para quem se fala ─────────────────────────────────────────
  const customers: string[] = [];
  const publico = resposta(estado, "publico");
  if (publico) customers.push(publico);

  // O que falta é o que o cliente NÃO respondeu — com a pergunta original,
  // para quem ler saber o que perguntar em vez de adivinhar.
  const missingContext = [
    ...avaliacao.naoPerguntado.map((p) => `Nunca perguntado — ${p.pergunta}`),
    ...avaliacao.aguardandoCliente.map((p) => `Aguardando o cliente — ${p.pergunta}`),
  ];

  const safetyNotes: string[] = [];
  if (!avaliacao.podePropor) safetyNotes.push(`A sondagem ainda não fechou: ${avaliacao.motivo}`);
  if (!proibicoes) safetyNotes.push("O cliente não declarou proibições — não presuma que pode falar qualquer coisa.");

  // Completude = quanto do essencial da sondagem foi respondido. Herda a régua
  // do SDR de propósito: destravar a produção é terminar a entrevista.
  const essenciais = CAMPOS_DA_FICHA.filter((c) => c.essencial).length;
  const completenessScore = essenciais === 0 ? 0 : avaliacao.cobertura / 100;

  return {
    businessId,
    businessType: "AGENCY",
    truthSources: {
      ...(products.length  > 0 ? { products }  : {}),
      ...(policies.length  > 0 ? { policies }  : {}),
      ...(materials.length > 0 ? { materials } : {}),
      ...(customers.length > 0 ? { customers } : {}),
    },
    missingContext,
    safetyNotes,
    snapshotAsOf: new Date().toISOString(),
    completenessScore,
  };
}

export const agencyKnowledgeAdapter: BusinessKnowledgeAdapter = {
  businessType: "AGENCY",

  async getSnapshot(businessId: string): Promise<BusinessKnowledgeSnapshot> {
    let estado: EstadoDaSondagem | null;
    try {
      estado = await lerEntrevista(businessId);
    } catch (err) {
      return snapshotVazio(businessId, `Falha ao ler o briefing: ${err instanceof Error ? err.message.slice(0, 120) : "erro"}`);
    }
    if (!estado) {
      return snapshotVazio(
        businessId,
        `Nenhum briefing encontrado para "${sufixoDaChave(businessId)}". Rode a sondagem do SDR antes de produzir.`,
      );
    }
    return snapshotDoBriefing(businessId, estado);
  },
};

registerKnowledgeAdapter(agencyKnowledgeAdapter);
