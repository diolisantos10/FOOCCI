/**
 * ⭐ CADASTRAR UM LEAD À MÃO — e a porta continua sendo UMA SÓ.
 *
 * ── O CASO QUE ORIGINOU ESTE ARQUIVO (19/09/2026) ───────────────────────────
 *
 * Cinco leads caíram na planilha da campanha do Facebook. Quatro entraram no
 * Foocci. A quinta — Elisa Oliveira, (11) 96954-5259, chegada em 18/09 às
 * 17h54 — **nunca entrou no sistema**, e ficou vinte horas esperando. Ao tentar
 * resolver o caso na mão, medimos o buraco de verdade: **não existia nenhum
 * lugar no Foocci para cadastrar um lead à mão.** Toda entrada dependia de
 * planilha, webhook ou rota com segredo. Não era um caso isolado; era uma falha
 * estrutural, e ela transformava qualquer falha de integração em lead perdido
 * sem plano B nenhum.
 *
 * ── ⛔ POR QUE ISTO NÃO ESCREVE EM `SiteLead` ───────────────────────────────
 *
 * Porque seria a quarta verdade sobre a origem do lead, e `importarMetaLead`
 * existe exatamente para que não haja uma segunda. Uma tela que escreve direto
 * no banco pareceria mais simples e custaria o que já custou uma vez: origem
 * divergente, que não se conserta depois porque ninguém sabe qual das duas
 * estava certa.
 *
 * Então este arquivo **não é uma porta nova**. É um tradutor: pega o que um
 * vendedor digita e o entrega à mesma recepção por onde o lead da Meta nasce,
 * com a fonte e o rótulo certos. Toda garantia daquela porta vale aqui sem ser
 * reescrita: idempotência, promoção do contato frio em vez de ficha nova,
 * relógio de SLA, trilha de auditoria.
 *
 * ── ⛔ CADASTRAR NÃO DISPARA MENSAGEM ───────────────────────────────────────
 *
 * O disparo está pausado por ordem do CEO. Nada neste caminho aciona envio:
 * `importarMetaLead` grava e registra, e só. Este arquivo não importa nenhum
 * módulo de abordagem, conversa ou canal — e um teste confere isso lendo o
 * fonte, porque comentário não é trava.
 */

import { z } from "zod";
import type { SiteLeadSource } from "@prisma/client";
import { whatsappBrValido, MENSAGEM_WHATSAPP_INVALIDO } from "@/lib/whatsapp-br";
import { importarMetaLead } from "@/services/meta-leads/importarMetaLead";

/** Como a origem se chama na ficha e na trilha de um lead digitado à mão. */
export const ROTULO_DO_CADASTRO_A_MAO = "Cadastro à mão — sala comercial";

/** Quem assina a nota de auditoria deste caminho. */
export const ATOR_DO_CADASTRO_A_MAO = "cadastro-a-mao";

/** A versão de política sob a qual este consentimento foi registrado. */
export const CONSENTIMENTO_DO_CADASTRO_A_MAO = "CADASTRO_MANUAL_SALA_COMERCIAL";

/**
 * AS ORIGENS QUE A TELA OFERECE — e a ordem é a da frequência real.
 *
 * ⚠️ **Esta lista é a decisão mais cara da tela.** A origem é o que separa
 * "lead de campanha" de "base fria", e essa diferença decide qual mensagem a
 * pessoa recebe depois — erro que já custou dinheiro nesta casa
 * (`salaDeVendas/frioOuLead.ts`). Por isso ela é um campo OBRIGATÓRIO e sem
 * valor pré-selecionado: um padrão silencioso faria o vendedor apressado
 * carimbar a origem errada sem nunca ter decidido nada.
 *
 * `LISTA_PROSPECCAO` está aqui de propósito, e é a única da lista que nasce
 * fria: quem digita um restaurante que ele mesmo garimpou precisa poder dizer
 * a verdade. Tirá-la faria essa pessoa escolher `MANUAL` e virar lead sem
 * nunca ter falado com a gente.
 */
export const ORIGENS_DO_CADASTRO_A_MAO: readonly {
  valor: SiteLeadSource;
  rotulo: string;
  /** A frase que a tela mostra embaixo da opção. Nunca decorativa. */
  explicacao: string;
}[] = [
  {
    valor: "CAMPANHA_PAGA",
    rotulo: "Campanha paga (Facebook/Instagram Ads)",
    explicacao:
      "Veio de anúncio nosso — inclusive o lead que caiu na planilha e não entrou sozinho. É lead de campanha, não base fria.",
  },
  {
    valor: "WHATSAPP_DIRETO",
    rotulo: "Chamou no WhatsApp",
    explicacao: "A pessoa escreveu para o nosso número.",
  },
  {
    valor: "INDICACAO",
    rotulo: "Indicação",
    explicacao: "Alguém indicou. Procurou a gente por conta de terceiro.",
  },
  {
    valor: "INSTAGRAM",
    rotulo: "Instagram (orgânico)",
    explicacao: "Veio do perfil, sem anúncio pago no meio.",
  },
  {
    valor: "FACEBOOK",
    rotulo: "Facebook (orgânico)",
    explicacao: "Veio da página, sem anúncio pago no meio.",
  },
  {
    valor: "FORMULARIO_DEMONSTRACAO",
    rotulo: "Formulário do site",
    explicacao: "Preencheu o formulário e por algum motivo não chegou sozinho.",
  },
  {
    valor: "AGENDAMENTO",
    rotulo: "Agendou horário",
    explicacao: "Marcou uma demonstração.",
  },
  {
    valor: "LISTA_PROSPECCAO",
    rotulo: "Prospecção nossa (base fria)",
    explicacao:
      "⚠️ NÓS fomos atrás. Isto NÃO é lead: entra como contato frio e só vira lead quando demonstrar interesse.",
  },
  {
    valor: "MANUAL",
    rotulo: "Outro — cadastrado à mão",
    explicacao: "Nenhuma das acima. Conta na observação como a pessoa chegou.",
  },
];

/**
 * Os mesmos valores, escritos à mão para o validador.
 *
 * ⚠️ Escritos, e não derivados da lista acima: `z.enum` precisa de uma tupla
 * literal para produzir o tipo, e um `.map()` devolveria `string[]`. O teste
 * `as duas listas não podem divergir` compara as duas — é ele, e não a boa
 * intenção, que impede a opção nova de entrar na tela sem entrar no validador.
 */
const VALORES = [
  "CAMPANHA_PAGA",
  "WHATSAPP_DIRETO",
  "INDICACAO",
  "INSTAGRAM",
  "FACEBOOK",
  "FORMULARIO_DEMONSTRACAO",
  "AGENDAMENTO",
  "LISTA_PROSPECCAO",
  "MANUAL",
] as const satisfies readonly SiteLeadSource[];

/**
 * O que a tela manda. Todo campo é limitado em tamanho: o corpo vem da rede, e
 * a sessão de um vendedor não é razão para confiar no tamanho de um texto.
 */
export const cadastroAMaoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome de quem vai ser atendido").max(120),
  whatsapp: z
    .string()
    .trim()
    .min(1, "Informe o WhatsApp")
    .max(30)
    .refine(whatsappBrValido, MENSAGEM_WHATSAPP_INVALIDO),
  email: z.string().trim().email("E-mail inválido").max(254).optional().or(z.literal("")),
  restaurante: z.string().trim().max(160).optional().or(z.literal("")),
  cidade: z.string().trim().max(120).optional().or(z.literal("")),
  /** ⚠️ Obrigatória, e sem padrão. Ver `ORIGENS_DO_CADASTRO_A_MAO`. */
  origem: z.enum(VALORES, {
    message: "Escolha a origem — ela decide o tratamento do lead",
  }),
  /** A pergunta do desenho do CRM 360 (desenho-04). Nome de casa, não inventado. */
  comoNosConheceu: z.string().trim().max(200).optional().or(z.literal("")),
  /** O nome da campanha, quando a origem for campanha paga. */
  campanha: z.string().trim().max(200).optional().or(z.literal("")),
});

export type CadastroAMaoInput = z.infer<typeof cadastroAMaoSchema>;

export type ResultadoDoCadastroAMao =
  | { status: "criado"; leadId: string; codigo: string | null; fonte: SiteLeadSource }
  | {
      status: "promovido";
      leadId: string;
      codigo: string | null;
      fonte: SiteLeadSource;
      fonteAnterior: SiteLeadSource;
      /** `true` = estava na base fria e virou lead agora. */
      virouLead: boolean;
    }
  | { status: "recusado"; motivo: string };

export interface QuemCadastrou {
  userId: string;
  nome: string;
}

/**
 * A CHAVE DE IDEMPOTÊNCIA DESTE CADASTRO.
 *
 * A porta única identifica cada nascimento por uma chave externa. O lead
 * digitado não tem `id` da Meta, então ele ganha uma chave do próprio caminho,
 * com quem digitou e o instante — e isso é uma chave de EVENTO, não de pessoa.
 *
 * ⚠️ Quem impede a pessoa duplicada NÃO é esta chave: é o telefone, em
 * `SiteLeadService.capture`. Dois cadastros do mesmo número, feitos por duas
 * pessoas, continuam caindo na MESMA ficha — o segundo vira promoção ou
 * reenvio, nunca uma segunda pessoa.
 */
export function chaveDoCadastroAMao(quem: QuemCadastrou, agora: Date): string {
  return `manual:${quem.userId}:${agora.toISOString()}`;
}

/**
 * ⚠️ O texto do campo `origem` da ficha.
 *
 * Não existe coluna para "como nos conheceu?" no `SiteLead`, e criar uma
 * migração no meio de uma urgência seria trocar um buraco por um risco. A
 * resposta vai para dois lugares que existem hoje: a trilha (nota de auditoria,
 * que o vendedor lê na ficha) e este texto, que é o que a ficha mostra como
 * "Origem". Escrito, e não prometido.
 */
export function textoDaOrigem(entrada: CadastroAMaoInput, quem: QuemCadastrou): string {
  const partes = [`${ROTULO_DO_CADASTRO_A_MAO} por ${quem.nome}`];
  const conheceu = entrada.comoNosConheceu?.trim();
  if (conheceu) partes.push(`conheceu por: ${conheceu}`);
  return partes.join(" — ").slice(0, 200);
}

export async function cadastrarLeadAMao(
  entrada: CadastroAMaoInput,
  quem: QuemCadastrou,
  opcoes: { agora?: Date } = {},
): Promise<ResultadoDoCadastroAMao> {
  const agora = opcoes.agora ?? new Date();
  const conheceu = entrada.comoNosConheceu?.trim() || null;

  const resultado = await importarMetaLead(
    {
      metaLeadId: chaveDoCadastroAMao(quem, agora),
      /* A data de chegada é AGORA, e é verdade: é o instante em que esta pessoa
       * passou a existir para o sistema. Inventar a data em que ela "deveria"
       * ter entrado apagaria justamente a espera que este cadastro conserta. */
      createdTime: agora.toISOString(),
      fullName: entrada.nome,
      phone: entrada.whatsapp,
      email: entrada.email || "",
      campaignName: entrada.campanha || "",
      /* ⚠️ Sem `formName`: a porta única o costura no texto da origem, e o
       * "como nos conheceu?" já entra por `rotuloDaOrigem` e por `complemento`.
       * Passá-lo aqui escreveria a mesma frase duas vezes na ficha. */
      platform: "manual",
      isOrganic: true,
      leadStatus: "CADASTRADO_A_MAO",
    },
    {
      agora,
      fonte: entrada.origem,
      rotuloDaOrigem: textoDaOrigem(entrada, quem),
      ator: ATOR_DO_CADASTRO_A_MAO,
      versaoDoConsentimento: CONSENTIMENTO_DO_CADASTRO_A_MAO,
      complemento: {
        restaurante: entrada.restaurante || null,
        cidade: entrada.cidade || null,
        comoNosConheceu: conheceu,
      },
      motivoDaPromocao: `Cadastrado à mão por ${quem.nome} como ${entrada.origem}${
        conheceu ? ` — conheceu por: ${conheceu}` : ""
      }`,
      /* A data existe sempre (é `agora`), então exigir ou não é indiferente —
       * mas deixamos explícito para que o fail-closed da porta continue valendo
       * se um dia alguém passar a data de outro lugar. */
      exigirDataDeChegada: true,
    },
  );

  if (resultado.status === "recusado") {
    return { status: "recusado", motivo: resultado.motivo };
  }

  if (resultado.status === "promovido") {
    return {
      status: "promovido",
      leadId: resultado.leadId,
      codigo: resultado.codigo,
      fonte: resultado.fonte,
      fonteAnterior: resultado.fonteAnterior,
      virouLead: resultado.virouLead,
    };
  }

  /* `jaExistia` só acontece quando a MESMA chave de evento roda duas vezes —
   * o clique duplo no botão. A pessoa é a mesma ficha, e dizer "promovido"
   * seria mentir sobre o que aconteceu; dizer "criado" também. A tela trata as
   * duas como "esta pessoa já estava na base". */
  if (resultado.status === "jaExistia") {
    return {
      status: "promovido",
      leadId: resultado.leadId,
      codigo: resultado.codigo,
      fonte: resultado.fonte,
      fonteAnterior: resultado.fonte,
      virouLead: false,
    };
  }

  return {
    status: "criado",
    leadId: resultado.leadId,
    codigo: resultado.codigo,
    fonte: resultado.fonte,
  };
}
