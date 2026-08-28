/**
 * O QUE A FICHA DO LEAD DIZ SOBRE O FORMULÁRIO E SOBRE A ORIGEM.
 *
 * PURO: sem banco, sem I/O. Recebe as colunas do `SiteLead` e devolve o que a
 * tela mostra. É o mesmo desenho de `leadOrigin.ts`, e pelo mesmo motivo: a
 * régua precisa ser testável sem subir Postgres, e precisa ser UMA só.
 *
 * ── POR QUE ESTE ARQUIVO NASCEU, E O QUE ELE NÃO É ──────────────────────────
 *
 * As duas informações daqui já existiam — dentro de `FoocciCrmService.getDossie`,
 * a serviço da tela velha do CRM (`/admin/foocci-crm`). A Sala Comercial lê a
 * MESMA tabela, então copiar aquele trecho para cá teria produzido duas réguas
 * sobre o mesmo dado: no dia em que o formulário do site ganhasse um campo, uma
 * das telas passaria a esconder a resposta e ninguém saberia qual.
 *
 * Então o trecho SAIU de lá e virou este arquivo, e `getDossie` passou a chamar
 * daqui. Nenhuma tela foi desligada; o que mudou é que agora existe um dono.
 *
 * ── A REGRA QUE GOVERNA AS DUAS FUNÇÕES ─────────────────────────────────────
 *
 * Campo em branco não vira linha em branco na tela. Quem não respondeu "qual é o
 * seu maior desafio" não tem uma linha "Principal desafio: —"; a pergunta some,
 * e o vazio da seção inteira é dito por extenso. Uma ficha cheia de travessões
 * ensina o vendedor a não ler a ficha.
 */

import {
  rotuloDaOrigem,
  canalDoContato,
  ROTULO_CANAL,
} from "@/services/foocci-crm/leadOrigin";

// ── 1. O que a pessoa respondeu no formulário do site ────────────────────────

/** As colunas do `SiteLead` que guardam resposta de formulário. */
export interface CamposDoFormulario {
  restaurante: string | null;
  cidade: string | null;
  tipo: string | null;
  desafio: string | null;
}

export interface RespostaDoFormulario {
  pergunta: string;
  resposta: string;
}

/**
 * O que a pessoa escreveu no site, em pergunta e resposta.
 *
 * ── POR QUE ISTO NÃO É SÓ "MOSTRAR AS COLUNAS" ──────────────────────────────
 *
 * `desafio` é a coluna mais valiosa da base para quem vai abordar — é a dor,
 * escrita pela própria pessoa, antes de qualquer conversa. E era a única que a
 * Sala Comercial não lia: a tela de atendimento nem pedia a coluna no `select`.
 * O vendedor abria a ficha, via nome, cidade e restaurante, e começava a
 * conversa perguntando exatamente o que a pessoa já tinha respondido.
 *
 * A ordem é a do formulário, e não a do banco: quem lê a ficha está relendo o
 * que a pessoa preencheu, e ler fora de ordem é reler duas vezes.
 */
export function respostasDoFormulario(lead: CamposDoFormulario): RespostaDoFormulario[] {
  const respostas: RespostaDoFormulario[] = [];

  if (lead.restaurante) respostas.push({ pergunta: "Nome do restaurante", resposta: lead.restaurante });
  if (lead.cidade)      respostas.push({ pergunta: "Cidade",              resposta: lead.cidade });
  if (lead.tipo)        respostas.push({ pergunta: "Tipo de restaurante", resposta: lead.tipo });
  if (lead.desafio)     respostas.push({ pergunta: "Principal desafio",   resposta: lead.desafio });

  return respostas;
}

// ── 2. De onde o contato veio ────────────────────────────────────────────────

/** As colunas do `SiteLead` que guardam origem. `origem` é a legada. */
export interface CamposDeOrigem {
  origem: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  clickId: string | null;
  landingPath: string | null;
  referrer: string | null;
}

export interface OrigemDoLead {
  /** Frase pronta e honesta. NUNCA vazia — ver `rotuloDaOrigem`. */
  rotulo: string;
  canal: string;
  /** O canal com nome de gente: "Facebook", "Direto", "Outro". */
  canalRotulo: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  clickId: string | null;
  landingPath: string | null;
  referrer: string | null;
  /** A página do formulário, do tempo em que ela era a única pista. */
  legado: string | null;
  /**
   * Existe QUALQUER pista de campanha?
   *
   * `false` é o gatilho do aviso "não dá para dizer qual anúncio trouxe este
   * contato". A conta é feita aqui, e não na tela, porque duas telas mostram
   * esta origem — a do CRM velho e a da Sala — e uma delas checava só quatro dos
   * sete sinais. Um lead que chegou só com `utm_medium` aparecia como "sem sinal
   * de campanha" numa tela e não na outra.
   */
  temSinalDeCampanha: boolean;
}

/**
 * A origem do contato, pronta para a ficha.
 *
 * O `rotulo` é o que aparece grande: ele já cai em "Direto / não identificado"
 * quando não há nada, que é a verdade. A tela NUNCA precisa decidir o que
 * escrever quando o campo está vazio — e é exatamente aí que uma tela inventa
 * um traço mudo, ou pior, um "Facebook" por chute.
 */
export function origemDoLead(lead: CamposDeOrigem): OrigemDoLead {
  const canal = canalDoContato(lead);

  return {
    rotulo: rotuloDaOrigem(lead),
    canal,
    canalRotulo: ROTULO_CANAL[canal] ?? canal,
    utmSource: lead.utmSource,
    utmMedium: lead.utmMedium,
    utmCampaign: lead.utmCampaign,
    utmContent: lead.utmContent,
    utmTerm: lead.utmTerm,
    clickId: lead.clickId,
    landingPath: lead.landingPath,
    referrer: lead.referrer,
    legado: lead.origem,
    temSinalDeCampanha:
      lead.utmSource !== null ||
      lead.utmMedium !== null ||
      lead.utmCampaign !== null ||
      lead.utmContent !== null ||
      lead.utmTerm !== null ||
      lead.clickId !== null ||
      lead.referrer !== null,
  };
}
