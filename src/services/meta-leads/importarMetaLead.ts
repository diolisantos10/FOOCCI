/**
 * ⭐ A PORTA ÚNICA POR ONDE UM LEAD DA META NASCE NO FOOCCI.
 *
 * ── POR QUE ISTO SAIU DE DENTRO DA ROTA ─────────────────────────────────────
 *
 * Em 18/09/2026 o CEO descobriu três leads pagos parados numa planilha do Google
 * — um deles havia 36 horas. Existiam, a partir dali, três caminhos possíveis
 * para o mesmo lead entrar: o webhook da Meta (`/api/v1/meta-leads`), um
 * comando administrativo de recuperação, e uma sincronização periódica da
 * planilha. Três caminhos, três chances de a casa passar a ter **duas verdades
 * sobre a origem do lead** — e origem divergente não se conserta depois, porque
 * ninguém sabe qual das duas estava certa.
 *
 * Então a regra de nascimento mora AQUI, sozinha, e os três caminhos a chamam.
 * Nenhum deles escreve em `SiteLead` por conta própria.
 *
 * ── O QUE ESTA PORTA GARANTE, E CADA GARANTIA TEM UM DEFEITO ATRÁS ──────────
 *
 * 1. **Idempotência pelo `id` da Meta.** Rodar duas vezes não cria seis leads.
 *    Não é higiene: duas fichas para a mesma pessoa reiniciam o contador de
 *    tentativas do portão do SDR, e a pessoa leva a mesma mensagem duas vezes.
 *
 * 2. **A data de chegada é a REAL.** `createdAt` recebe o `created_time` da
 *    Meta, não o instante da importação. Gravar "agora" faria o lead de 36
 *    horas nascer novinho — e o atraso, que é o defeito que se quer enxergar,
 *    sumiria da conta no mesmo gesto que o conserta. O relógio do SLA
 *    (`prazoDaPrimeiraResposta`) lê `createdAt`: mentir aqui apaga o atraso
 *    também do painel.
 *
 * 3. **Fuso.** O `created_time` da Meta vem com deslocamento `-05:00`, não
 *    Brasília. `new Date(iso)` resolve o deslocamento corretamente; o que NÃO
 *    se pode fazer é cortar o sufixo e tratar como local — isso adianta o lead
 *    em duas horas.
 *
 * 4. **Contato frio vira lead de campanha, e não uma segunda ficha.** Se o
 *    telefone já existia como lista fria, a ficha é PROMOVIDA (histórico
 *    inteiro preservado) por `promoverFrioParaLead`, e só então a fonte passa a
 *    `CAMPANHA_PAGA`.
 *
 * 5. **A fonte é uma das que a recepção enxerga.** `CAMPANHA_PAGA` está em
 *    `FONTES_QUE_NOS_PROCURARAM`. Gravar uma fonte de fora daquela lista faria
 *    o lead entrar e ficar parado do mesmo jeito — o defeito teria só mudado de
 *    lugar. O teste `fonteGravadaEhVistaPelaRecepcao` existe para que essa
 *    ligação não possa ser quebrada em silêncio.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSiteLeadSchema } from "@/validators/site-lead";
import { SiteLeadService } from "@/services/site/SiteLeadService";
import { FONTES_QUE_NOS_PROCURARAM } from "@/services/salaDeVendas/recepcao/portasDeEntrada";
import { veioDeListaFria } from "@/services/salaDeVendas/frioOuLead";
import { AUTORIA_SISTEMA, promoverFrioParaLead } from "@/services/salaDeVendas/jornadaComercial";
import type { SiteLeadSource } from "@prisma/client";

/** A fonte que esta porta grava. Uma constante porque um teste a confere. */
export const FONTE_DO_LEAD_DE_CAMPANHA: SiteLeadSource = "CAMPANHA_PAGA";

/** Quem assina as notas internas desta porta. Também é a chave da idempotência. */
export const ATOR_DA_INTEGRACAO = "integracao-meta-leads";

/**
 * O payload, exatamente com os nomes que a planilha e o webhook usam.
 *
 * ⚠️ `metaLeadId` guarda o `id` INTEIRO, com o prefixo `l:` que a Meta manda
 * (`l:1780749103267171`). Cortar o prefixo pareceria limpeza e seria o oposto:
 * a chave gravada deixaria de bater com a chave da planilha, e a idempotência
 * morreria exatamente na segunda rodada, que é quando ela importa.
 */
export const metaLeadSchema = z.object({
  metaLeadId: z.string().trim().min(1).max(200),
  createdTime: z.string().trim().max(80).optional().or(z.literal("")),
  adId: z.string().trim().max(200).optional().or(z.literal("")),
  adName: z.string().trim().max(300).optional().or(z.literal("")),
  adsetId: z.string().trim().max(200).optional().or(z.literal("")),
  adsetName: z.string().trim().max(300).optional().or(z.literal("")),
  campaignId: z.string().trim().max(200).optional().or(z.literal("")),
  campaignName: z.string().trim().max(300).optional().or(z.literal("")),
  formId: z.string().trim().max(200).optional().or(z.literal("")),
  formName: z.string().trim().max(300).optional().or(z.literal("")),
  isOrganic: z.boolean().optional(),
  platform: z.string().trim().max(80).optional().or(z.literal("")),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  phone: z.string().trim().min(1).max(40),
  leadStatus: z.string().trim().max(120).optional().or(z.literal("")),
});

export type MetaLeadPayload = z.infer<typeof metaLeadSchema>;

export interface OpcoesDaImportacao {
  /**
   * Marca a ficha como prioritária.
   *
   * ⚠️ HONESTIDADE SOBRE O QUE ISTO FAZ: `prioritario` hoje **ordena listas** e
   * nada mais — nenhuma regra de distribuição, de recepção ou de ritmo o lê
   * (está escrito, medido, em `salaDeVendas/telas/roteamento.ts`). Marcar aqui
   * põe o lead no topo da tela de quem abrir a fila; não o faz ser atendido
   * antes pela máquina. Prometer o contrário seria vender trava onde só existe
   * aviso.
   */
  prioritario?: boolean;
  /**
   * Sem data de chegada legível, recusa em vez de inventar "agora".
   *
   * Ligado na planilha e no comando administrativo (fail-closed: linha
   * malformada não vira lead). Desligado no webhook da Meta, onde perder o lead
   * é pior que registrá-lo com a data aproximada — e o retorno diz qual foi.
   */
  exigirDataDeChegada?: boolean;
  /** Injeção para teste. Só entra na nota de auditoria. */
  agora?: Date;

  /* ── O QUE FOI ABERTO EM 19/09/2026, E POR QUÊ ──────────────────────────────
   *
   * Elisa Oliveira entrou na planilha da campanha em 18/09 às 17h54 e passou 20
   * horas fora do Foocci. Ao tentar resolver à mão, medimos o buraco: **não
   * existia lugar nenhum nesta casa para cadastrar um lead à mão** — toda
   * entrada dependia de planilha, webhook ou rota com segredo.
   *
   * A saída óbvia seria uma tela que escreve em `SiteLead`. Seria a quarta
   * verdade sobre a origem do lead, e o cabeçalho deste arquivo já explica o
   * preço disso. Então a porta continua sendo **uma só**, e o que ela ganhou
   * foram os parâmetros que o cadastro à mão precisa e o formulário da Meta
   * não tem. Nada aqui dispara mensagem: cadastrar é cadastrar.
   *
   * ⚠️ Todos têm padrão igual ao comportamento anterior. Quem chamava esta
   * função antes de 19/09/2026 continua obtendo exatamente o mesmo resultado. */

  /**
   * A porta por onde este lead nasce. Padrão: `CAMPANHA_PAGA`.
   *
   * ⚠️ É a diferença entre "lead de campanha" e "base fria", e ela decide qual
   * mensagem a pessoa recebe depois — erro que já custou dinheiro nesta casa.
   * Ver `salaDeVendas/frioOuLead.ts`.
   */
  fonte?: SiteLeadSource;
  /** O que o formulário da Meta não coleta e o cadastro à mão coleta. */
  complemento?: {
    restaurante?: string | null;
    cidade?: string | null;
    /** A pergunta do desenho do CRM 360: "como nos conheceu?". */
    comoNosConheceu?: string | null;
  };
  /**
   * Como a origem se chama na ficha e na trilha. Padrão: `"Meta Lead Ads"`.
   *
   * Escrever "Meta Lead Ads" num lead digitado por um vendedor seria inventar
   * uma atribuição — e atribuição errada não se conserta depois, porque ninguém
   * sabe qual das duas estava certa.
   */
  rotuloDaOrigem?: string;
  /** Quem assina a nota de auditoria. Padrão: `ATOR_DA_INTEGRACAO`. */
  ator?: string;
  /**
   * A versão da política sob a qual o consentimento foi dado. Padrão:
   * `"META_LEAD_FORM"`. O cadastro à mão grava a SUA, porque dizer que a pessoa
   * preencheu um formulário da Meta quando um vendedor a digitou é prova falsa.
   */
  versaoDoConsentimento?: string;
  /**
   * A prova da promoção, quando o telefone já estava na base fria. Padrão: a
   * frase do formulário da campanha.
   *
   * `promoverFrioParaLead` exige um motivo de propósito — ele é o que a ficha
   * mostra para explicar por que aquela pessoa deixou de ser lista fria. Uma
   * frase genérica ali apagaria a única prova que existe do interesse.
   */
  motivoDaPromocao?: string;
}

export type ResultadoDaImportacao =
  /** Ficha nova, nascida com a data real de chegada. */
  | { status: "criado"; leadId: string; codigo: string | null; stage: string; fonte: SiteLeadSource; chegouEm: Date; dataAproximada: boolean }
  /** Este `metaLeadId` já tinha sido importado. Nada foi escrito. */
  | { status: "jaExistia"; leadId: string; codigo: string | null; stage: string; fonte: SiteLeadSource; metaLeadId: string }
  /** O telefone já existia; a ficha foi promovida, o histórico ficou. */
  | { status: "promovido"; leadId: string; codigo: string | null; stage: string; fonte: SiteLeadSource; fonteAnterior: SiteLeadSource; virouLead: boolean }
  /** Nada foi escrito, e o motivo está escrito. */
  | { status: "recusado"; motivo: string; metaLeadId: string | null };

function limpo(valor: string | undefined | null): string | null {
  const texto = typeof valor === "string" ? valor.trim() : "";
  return texto === "" ? null : texto;
}

/**
 * O telefone da planilha vem como `p:+5511913410821`.
 *
 * O prefixo `p:` é da Meta, não do número. Ele passa direto pelo validador
 * brasileiro como "dígito nenhum reconhecível" e a linha inteira seria recusada
 * — três leads pagos perdidos por dois caracteres. Tiramos o prefixo e
 * **guardamos o original** na nota de auditoria: o que a Meta mandou continua
 * conferível.
 */
export function telefoneSemPrefixoDaMeta(bruto: string): string {
  return bruto.trim().replace(/^p\s*:\s*/i, "").trim();
}

/**
 * A data de chegada, respeitando o deslocamento que veio escrito.
 *
 * `null` quando ilegível — e `null` aqui é uma resposta, não um erro a ser
 * substituído por `new Date()`. Quem chama decide se recusa ou se aproxima.
 */
export function chegadaDaMeta(bruto: string | undefined | null): Date | null {
  const texto = limpo(bruto);
  if (!texto) return null;
  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? null : data;
}

export function marcadorExterno(metaLeadId: string): string {
  return `meta-lead:${metaLeadId}`;
}

function origemDaMeta(payload: MetaLeadPayload, rotulo: string): string {
  const formulario = limpo(payload.formName) ?? limpo(payload.formId);
  return formulario ? `${rotulo} — ${formulario}` : rotulo;
}

/**
 * A nota de auditoria. É ela que carrega `meta_lead_id=`, e é por ela que a
 * idempotência sobrevive mesmo quando o `clickId` do primeiro toque já era
 * outro — o `clickId` pertence a quem trouxe a pessoa primeiro e não se
 * sobrescreve.
 */
function notaDeAuditoria(
  payload: MetaLeadPayload,
  telefoneBruto: string,
  opcoes: OpcoesDaImportacao,
): string {
  const pares = [
    ["meta_lead_id", payload.metaLeadId],
    ["created_time", limpo(payload.createdTime)],
    ["campaign", limpo(payload.campaignName)],
    ["campaign_id", limpo(payload.campaignId)],
    ["adset", limpo(payload.adsetName)],
    ["adset_id", limpo(payload.adsetId)],
    ["ad", limpo(payload.adName)],
    ["ad_id", limpo(payload.adId)],
    ["form", limpo(payload.formName)],
    ["form_id", limpo(payload.formId)],
    ["platform", limpo(payload.platform)],
    ["lead_status", limpo(payload.leadStatus)],
    ["telefone_original", telefoneBruto],
    ["is_organic", payload.isOrganic === undefined ? null : String(payload.isOrganic)],
    /* Não existe coluna para "como nos conheceu?" no `SiteLead`, e inventar uma
     * migração no meio de uma urgência seria trocar um buraco por um risco. A
     * resposta fica na trilha — que é onde o vendedor a lê na ficha — e também
     * no campo `origem`, montado por quem chama. Escrito, não prometido. */
    ["como_nos_conheceu", limpo(opcoes.complemento?.comoNosConheceu)],
    ["restaurante", limpo(opcoes.complemento?.restaurante)],
    ["cidade", limpo(opcoes.complemento?.cidade)],
  ] as const;

  return `${opcoes.rotuloDaOrigem ?? "Meta Lead Ads"} | ${pares
    .filter(([, valor]) => valor !== null && valor !== "")
    .map(([chave, valor]) => `${chave}=${valor}`)
    .join(" | ")}`;
}

/** Já importamos este `metaLeadId` alguma vez? Duas buscas, e a ordem importa. */
async function jaImportado(metaLeadId: string, ator: string) {
  const porClickId = await prisma.siteLead.findFirst({
    where: { clickId: marcadorExterno(metaLeadId) },
    select: { id: true, codigo: true, stage: true, fonte: true },
  });
  if (porClickId) return porClickId;

  const interacao = await prisma.siteLeadInteraction.findFirst({
    where: {
      actor: ator,
      tipo: "NOTA_INTERNA",
      nota: { contains: `meta_lead_id=${metaLeadId}` },
    },
    orderBy: { createdAt: "desc" },
    select: { lead: { select: { id: true, codigo: true, stage: true, fonte: true } } },
  });
  return interacao?.lead ?? null;
}

/** A fonte é enxergada pela recepção? Pergunta que um teste faz de verdade. */
export function fonteEhVistaPelaRecepcao(fonte: SiteLeadSource): boolean {
  return (FONTES_QUE_NOS_PROCURARAM as readonly SiteLeadSource[]).includes(fonte);
}

export async function importarMetaLead(
  entrada: MetaLeadPayload,
  opcoes: OpcoesDaImportacao = {},
): Promise<ResultadoDaImportacao> {
  const agora = opcoes.agora ?? new Date();
  const payload = entrada;
  const marcador = marcadorExterno(payload.metaLeadId);

  /* Os quatro parâmetros da porta. Cada padrão é o comportamento que esta
   * função já tinha — abrir a porta para o cadastro à mão não podia mudar uma
   * vírgula do que o webhook da Meta faz. */
  const fonteDoNascimento = opcoes.fonte ?? FONTE_DO_LEAD_DE_CAMPANHA;
  const rotulo = opcoes.rotuloDaOrigem ?? "Meta Lead Ads";
  const ator = opcoes.ator ?? ATOR_DA_INTEGRACAO;

  const chegouEmReal = chegadaDaMeta(payload.createdTime);
  if (!chegouEmReal && opcoes.exigirDataDeChegada !== false) {
    return {
      status: "recusado",
      metaLeadId: payload.metaLeadId,
      motivo: `created_time ausente ou ilegível (${payload.createdTime ?? "vazio"}) — sem data de chegada o atraso não pode ser medido, e inventar "agora" o apagaria`,
    };
  }
  const chegouEm = chegouEmReal ?? agora;
  const dataAproximada = chegouEmReal === null;

  const anterior = await jaImportado(payload.metaLeadId, ator);
  if (anterior) {
    return {
      status: "jaExistia",
      leadId: anterior.id,
      codigo: anterior.codigo,
      stage: String(anterior.stage),
      fonte: anterior.fonte,
      metaLeadId: payload.metaLeadId,
    };
  }

  const telefone = telefoneSemPrefixoDaMeta(payload.phone);
  const plataforma = limpo(payload.platform)?.toLowerCase() ?? "facebook";

  const mapeado = createSiteLeadSchema.safeParse({
    nome: payload.fullName,
    whatsapp: telefone,
    restaurante: limpo(opcoes.complemento?.restaurante) ?? "",
    cidade: limpo(opcoes.complemento?.cidade) ?? "",
    tipo: "",
    desafio: "",
    origem: origemDaMeta(payload, rotulo),
    utmSource: plataforma,
    utmMedium: payload.isOrganic ? "organic" : "paid_social",
    utmCampaign: limpo(payload.campaignName) ?? limpo(payload.campaignId) ?? "",
    utmContent: limpo(payload.adName) ?? limpo(payload.adId) ?? "",
    utmTerm: limpo(payload.adsetName) ?? limpo(payload.adsetId) ?? "",
    clickId: marcador,
    landingPath: "",
    referrer: "meta-lead-ads",
  });

  if (!mapeado.success) {
    return {
      status: "recusado",
      metaLeadId: payload.metaLeadId,
      motivo: mapeado.error.issues[0]?.message ?? "Lead inválido.",
    };
  }

  const capturado = await SiteLeadService.capture(mapeado.data);
  const atual = await prisma.siteLead.findUnique({
    where: { id: capturado.id },
    select: { email: true, fonte: true },
  });
  const fonteAnterior = atual?.fonte ?? fonteDoNascimento;

  /* ── O CONTATO FRIO QUE ACABOU DE LEVANTAR A MÃO ────────────────────────────
   * A promoção vem ANTES de mexer na fonte, e a ordem é o ponto inteiro:
   * `promoverFrioParaLead` só aceita quem ainda é frio. Trocar a fonte primeiro
   * faria a própria promoção ser recusada por "naoEhFrio" — o carimbo de
   * interesse nunca existiria, e a ficha diria que a pessoa sempre foi lead. */
  let virouLead = false;
  if (capturado.duplicado && veioDeListaFria({ fonte: fonteAnterior })) {
    const promocao = await promoverFrioParaLead(prisma, {
      leadId: capturado.id,
      motivo:
        opcoes.motivoDaPromocao ??
        `Preencheu o formulário "${limpo(payload.formName) ?? "Meta Lead Ads"}" da campanha paga no Facebook (${payload.metaLeadId})`,
      autoria: AUTORIA_SISTEMA,
      agora,
    });
    virouLead = promocao.promoveu;
  }

  /* A fonte só é reescrita quando a atual NÃO é enxergada pela recepção.
   * Quem já entrou por uma porta da frente (formulário, WhatsApp direto)
   * mantém o primeiro toque — reescrever apagaria a atribuição verdadeira. */
  const trocarFonte = !capturado.duplicado || !fonteEhVistaPelaRecepcao(fonteAnterior);
  const fonteFinal = trocarFonte ? fonteDoNascimento : fonteAnterior;

  await prisma.$transaction([
    prisma.siteLead.update({
      where: { id: capturado.id },
      data: {
        fonte: fonteFinal,
        email: atual?.email ?? limpo(payload.email),
        consentAt: chegouEm,
        consentPolicyVersion: opcoes.versaoDoConsentimento ?? "META_LEAD_FORM",
        lastInteractionAt: agora,
        ...(opcoes.prioritario ? { prioritario: true } : {}),
        /* ⚠️ A DATA DE CHEGADA, e só para ficha NOVA.
         * Numa ficha que já existia, `createdAt` é o primeiro toque dela e não
         * pertence a esta importação — reescrever faria a pessoa parecer mais
         * nova do que é e zeraria a espera que já estava correndo. */
        ...(capturado.duplicado ? {} : { createdAt: chegouEm, stageChangedAt: chegouEm }),
      },
    }),
    prisma.siteLeadInteraction.create({
      data: {
        leadId: capturado.id,
        tipo: "NOTA_INTERNA",
        actor: ator,
        nota: notaDeAuditoria(payload, payload.phone, opcoes),
        interna: true,
        createdAt: agora,
      },
    }),
  ]);

  const final = await prisma.siteLead.findUnique({
    where: { id: capturado.id },
    select: { id: true, codigo: true, stage: true, fonte: true },
  });

  if (capturado.duplicado) {
    return {
      status: "promovido",
      leadId: capturado.id,
      codigo: final?.codigo ?? capturado.codigo,
      stage: String(final?.stage ?? "NOVO"),
      fonte: final?.fonte ?? fonteFinal,
      fonteAnterior,
      virouLead,
    };
  }

  return {
    status: "criado",
    leadId: capturado.id,
    codigo: final?.codigo ?? capturado.codigo,
    stage: String(final?.stage ?? "NOVO"),
    fonte: final?.fonte ?? fonteFinal,
    chegouEm,
    dataAproximada,
  };
}
