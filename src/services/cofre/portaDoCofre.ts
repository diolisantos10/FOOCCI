/**
 * ⭐ A PORTA DO COFRE — IA e chamados pela Control Room, com o segredo do
 * pareamento (src/services/cofre/pareamento.ts) no `X-Service-Token`.
 *
 * Regra do CEO de 04/10/2026: "todos os produtos ligados ao cofre". Nenhuma
 * chamada daqui cai para chave própria de laboratório: se o cofre não atende,
 * sobe `FalhaDoCofre` com motivo nomeado e quem chamou usa o caminho
 * determinístico.
 */

import { baseDaControlRoom, obterOuCriarSegredo, PRODUTO_NO_CATALOGO } from "./pareamento";

export type MotivoDaFalhaDoCofre =
  | "nao_configurado"   // falta o centro de custo do Foocci na Control Room
  | "nao_pareado"       // 401: pareamento ainda não aprovado (ou revogado)
  | "sem_executor"      // 409: a Control Room não tem perfil/política para o pedido
  | "laboratorio_falhou"
  | "prazo"
  | "rede";

export class FalhaDoCofre extends Error {
  constructor(readonly motivo: MotivoDaFalhaDoCofre, detalhe: string) {
    super(`cofre: ${motivo} — ${detalhe}`);
    this.name = "FalhaDoCofre";
  }
}

export interface MensagemDoCofre {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Menor que o prazo do portão, para o cliente não esperar duas desistências. */
const PRAZO_MS = 12_000;

/**
 * Uma geração de TEXTO pela porta oficial (`POST /api/v1/ai/gateway/execute`).
 * Devolve o conteúdo; lança `FalhaDoCofre` em qualquer outro caso.
 */
export async function executarTextoNoCofre(input: {
  mensagens: MensagemDoCofre[];
  /** Crachá de quem pede, ex.: `dioli.foocci.atendimento.garcom`. */
  papel: string;
  maxTokens?: number;
}): Promise<string> {
  const centroCustoId = (process.env.CONTROL_ROOM_CENTRO_CUSTO_ID ?? "").trim();
  if (!centroCustoId) {
    throw new FalhaDoCofre("nao_configurado", "CONTROL_ROOM_CENTRO_CUSTO_ID ausente (o setup do Foocci na Control Room)");
  }
  const segredo = await obterOuCriarSegredo();

  let resposta: Response;
  try {
    resposta = await fetch(`${baseDaControlRoom()}/api/v1/ai/gateway/execute`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-token": segredo },
      body: JSON.stringify({
        roleAddress: input.papel,
        workClass: "customer_operation",
        modalidade: "text",
        centroCustoId,
        escopo: { holdingId: "dioli", productId: PRODUTO_NO_CATALOGO },
        ambiente: "production",
        payloadRef: `foocci://${input.papel}/${Date.now()}`,
        classificacaoDados: "internal",
        solicitadoPor: input.papel,
        mensagens: input.mensagens.filter((m) => m.content.trim() !== ""),
        ...(input.maxTokens ? { maxTokens: input.maxTokens } : {}),
      }),
      signal: AbortSignal.timeout(PRAZO_MS),
    });
  } catch (e) {
    const prazo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new FalhaDoCofre(prazo ? "prazo" : "rede", e instanceof Error ? e.message : String(e));
  }

  const corpo = (await resposta.json().catch(() => null)) as
    | { ok?: boolean; motivo?: string; erro?: string; resultado?: { sucesso?: boolean; conteudo?: string; erro?: string } }
    | null;

  if (resposta.status === 401) throw new FalhaDoCofre("nao_pareado", corpo?.erro ?? "401");
  if (resposta.status === 409) throw new FalhaDoCofre("sem_executor", corpo?.motivo ?? "409");
  const conteudo = corpo?.resultado?.conteudo;
  if (resposta.ok && corpo?.ok === true && corpo.resultado?.sucesso === true && typeof conteudo === "string" && conteudo.trim()) {
    return conteudo.trim();
  }
  throw new FalhaDoCofre(
    "laboratorio_falhou",
    `HTTP ${resposta.status} ${corpo?.resultado?.erro ?? corpo?.erro ?? corpo?.motivo ?? ""}`.trim().slice(0, 200),
  );
}

export type ResultadoDoChamado =
  | { aberto: true; chamadoId: string }
  | { aberto: false; motivo: string };

/**
 * Abre chamado na Sala de Manutenção (`POST /manutencao/chamados`) com o mesmo
 * segredo. Nunca lança: chamado que não abriu volta com o motivo, e quem chamou
 * decide falhar (o e-mail do GitHub é a reserva).
 */
export async function abrirChamadoNaManutencao(input: {
  descricao: string;
  gravidade: "critico" | "normal";
  evidencia?: string;
}): Promise<ResultadoDoChamado> {
  try {
    const segredo = await obterOuCriarSegredo();
    const resposta = await fetch(`${baseDaControlRoom()}/manutencao/chamados`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-token": segredo },
      body: JSON.stringify({
        produtoAfetado: PRODUTO_NO_CATALOGO,
        descricao: input.descricao.slice(0, 2000),
        gravidade: input.gravidade,
        ...(input.evidencia ? { evidencia: input.evidencia.slice(0, 2000) } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const corpo = (await resposta.json().catch(() => null)) as { chamadoId?: string; erro?: string } | null;
    if (resposta.status === 201 && corpo?.chamadoId) return { aberto: true, chamadoId: corpo.chamadoId };
    return { aberto: false, motivo: `HTTP ${resposta.status} ${corpo?.erro ?? ""}`.trim().slice(0, 200) };
  } catch (e) {
    return { aberto: false, motivo: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }
}
