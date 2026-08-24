/**
 * FoocciSalesInbound — o que acontece quando alguém escreve no número de VENDAS.
 *
 * ── O buraco que isto tapa, e ele é o buraco principal ───────────────────────
 * O webhook da Meta mapeia `phone_number_id` → restaurante
 * (`src/app/api/webhooks/meta/whatsapp/route.ts:167`). Quando não bate nenhum, a
 * mensagem é registrada num `console.warn` e **descartada**. O número de vendas da
 * Foocci não tem restaurante — ou seja: no dia em que o CEO ligar o número, o
 * "oi" que o site pediu para a pessoa mandar chegaria e sumiria, com um aviso que
 * ninguém lê. O site inteiro já está pronto para mandar esse "oi"
 * (`src/components/marketing/config.ts`), e não havia ninguém do outro lado.
 *
 * ── O que este módulo faz, e o que ele DELIBERADAMENTE não faz ───────────────
 * FAZ: reconhece de quem é o "oi" (pelo `#código` do formulário, ou pelo
 * telefone), cria o contato quando ele não existe, aplica pedido de silêncio e
 * registra a entrada na linha do tempo do lead.
 *
 * NÃO FAZ: **não redige e não envia nada**. Compor a resposta é do Cérebro, com
 * portão, verdade da Foocci e verificador de promessa — e a escada de liberação
 * ainda não autorizou a primeira mensagem. Este módulo devolve o que aconteceu e
 * cala a boca. Um recepcionista que anota o recado não é o vendedor.
 *
 * ⚠️ E NÃO TOCA em `Customer`, `Conversation` nem `Message`: quem escreve no
 * número de vendas é um dono de restaurante interessado no Foocci, não cliente de
 * restaurante nenhum. Misturar as duas bases colocaria prospecto dentro da
 * Central de Conversas de algum lojista.
 */

import { prisma } from "@/lib/prisma";
import { extractLeadCode } from "@/lib/site/leadCode";
import { detectOptOutIntent } from "@/services/crm/ContactSafetyService";
import { analisarWhatsappBr } from "@/lib/whatsapp-br";
import { normalizaWhatsapp } from "@/services/foocci-crm/leadOrigin";
import { registrarEntrada } from "@/services/salaDeVendas/conversa";
import type { TipoDaMensagem } from "@prisma/client";

// ─── A parte pura ───────────────────────────────────────────────────────────────

export interface LeituraDaMensagem {
  /** O `#A7K2M` que o formulário colocou na mensagem, quando veio. */
  codigo: string | null;
  /** A pessoa está pedindo para parar de receber. */
  pedeSilencio: boolean;
  /** Tem texto de verdade (não é só figurinha, áudio ou anexo). */
  temTexto: boolean;
}

/**
 * Lê a mensagem sem tocar em banco. Separada para caber em teste sem mock, e
 * porque é ela que carrega as duas decisões que mudam tudo: quem é a pessoa e se
 * ela quer silêncio.
 */
export function interpretarMensagemDeVendas(text: string | null | undefined): LeituraDaMensagem {
  const t = (text ?? "").trim();
  return {
    codigo: t ? extractLeadCode(t) : null,
    pedeSilencio: detectOptOutIntent(t),
    temTexto: t.length > 0,
  };
}

// ─── O resultado ────────────────────────────────────────────────────────────────

export type EntradaDeVendasStatus =
  /** Contato reconhecido pelo `#código` da mensagem — o caminho feliz. */
  | "RECONHECIDO_POR_CODIGO"
  /** Reconhecido pelo telefone (mensagem sem código, ou código perdido). */
  | "RECONHECIDO_POR_TELEFONE"
  /** Ninguém conhecido: contato novo, criado como WHATSAPP_DIRETO. */
  | "CONTATO_NOVO"
  /** Pediu silêncio. Registrado; nada mais será enviado, nunca. */
  | "PEDIU_SILENCIO"
  /** Não deu para gravar. Nunca vira sucesso silencioso (guardrail 1). */
  | "FALHOU";

export interface EntradaDeVendas {
  status: EntradaDeVendasStatus;
  leadId: string | null;
  codigo: string | null;
  /** Frase curta com o caso concreto, para o log (guardrail 6). */
  detalhe: string;
}

// ─── O recepcionista ────────────────────────────────────────────────────────────

export interface MensagemDeVendas {
  /** `wa_id` de quem escreveu — o número que a Meta devolveria numa resposta. */
  fromPhone: string;
  text: string | null;
  /** Nome do perfil do WhatsApp, quando a Meta manda. */
  profileName?: string | null;
  agora?: Date;

  // ── A CONVERSA (Sala de Vendas, 25/08/2026) ───────────────────────────────
  //
  // Até aqui este módulo registrava que a pessoa escreveu, sem guardar O QUE
  // ela escreveu: a linha do tempo dizia "Escreveu no WhatsApp de vendas" e a
  // mensagem morria no log do webhook. Servia para o SDR saber que havia
  // movimento; não servia para ninguém ATENDER — a tela de atendimento
  // precisava abrir a conversa, e não havia conversa.
  //
  // Os campos abaixo são opcionais para o módulo continuar funcionando para
  // quem já o chamava. Sem `waMessageId` a mensagem não é gravada, porque sem
  // ele não há como impedir que a reentrega da Meta duplique a conversa.
  /** `id` da mensagem na Meta. É a chave da idempotência. */
  waMessageId?: string | null;
  tipo?: TipoDaMensagem;
  /** Tipo cru do provedor quando não sabemos representá-lo. */
  tipoCru?: string | null;
  legenda?: string | null;
  midiaId?: string | null;
  midiaMimeType?: string | null;
  midiaNome?: string | null;
  duracaoSeg?: number | null;
}

/**
 * Recebe o "oi" e devolve o que aconteceu. Nunca lança: derrubar o webhook é pior
 * que perder o registro de uma mensagem — mas a falha vem escrita, nunca como
 * silêncio.
 */
export async function receberMensagemDeVendas(msg: MensagemDeVendas): Promise<EntradaDeVendas> {
  const agora = msg.agora ?? new Date();
  const leitura = interpretarMensagemDeVendas(msg.text);

  const analise = analisarWhatsappBr(msg.fromPhone);
  const digitos = analise.ok ? analise.digitos : normalizaWhatsapp(msg.fromPhone);

  try {
    const lead = await encontrarLead(leitura.codigo, digitos, msg.fromPhone);

    // ── 1. Pediu silêncio ───────────────────────────────────────────────────
    // Vem antes de tudo: nem "contato novo" tem precedência sobre alguém dizendo
    // PARE. Se a pessoa não existe na base e manda PARE, gravamos o contato
    // JUSTAMENTE para poder honrar o silêncio — uma base que não sabe quem pediu
    // para parar volta a incomodar a mesma pessoa na semana seguinte.
    if (leitura.pedeSilencio) {
      const alvo = lead ?? (await criarContatoDeWhatsApp(msg, digitos, agora, { jaOptOut: true }));
      if (!alvo) {
        return { status: "FALHOU", leadId: null, codigo: null, detalhe: "pedido de silêncio recebido e NÃO gravado" };
      }
      await prisma.siteLead.update({
        where: { id: alvo.id },
        data: {
          optOutAt: alvo.optOutAt ?? agora, // idempotente: não reescreve a data original
          optOutCanal: alvo.optOutAt ? undefined : "whatsapp",
          lastInteractionAt: agora,
        },
      });
      await registrarInteracao(alvo.id, "NOTA", "Pediu para não receber mais mensagens (WhatsApp).", agora);
      // A mensagem do pedido de silêncio é gravada como qualquer outra: ela É a
      // evidência do opt-out. Uma auditoria de LGPD que só encontra a data, sem
      // o texto que a originou, não consegue demonstrar nada.
      await gravarNaConversa(alvo.id, msg, agora);
      return {
        status: "PEDIU_SILENCIO",
        leadId: alvo.id,
        codigo: alvo.codigo,
        detalhe: "opt-out registrado — nada mais será enviado a este contato",
      };
    }

    // ── 2. Contato novo: escreveu direto, sem passar pelo formulário ─────────
    // Acontece com quem vem de anúncio "Click to WhatsApp" ou de indicação. Quem
    // escreve primeiro está consentindo em ser respondido — por isso `consentAt`
    // é AGORA, e não uma data emprestada de outro lugar.
    if (!lead) {
      const novo = await criarContatoDeWhatsApp(msg, digitos, agora, { jaOptOut: false });
      if (!novo) {
        return { status: "FALHOU", leadId: null, codigo: null, detalhe: "contato novo NÃO gravado" };
      }
      await gravarNaConversa(novo.id, msg, agora);
      return {
        status: "CONTATO_NOVO",
        leadId: novo.id,
        codigo: novo.codigo,
        detalhe: "primeiro contato pelo WhatsApp, sem formulário",
      };
    }

    // ── 3. Já conhecido: a linha do tempo ganha a resposta ───────────────────
    await prisma.siteLead.update({
      where: { id: lead.id },
      data: { lastInteractionAt: agora },
    });
    await registrarInteracao(lead.id, "RESPOSTA_RECEBIDA", "Escreveu no WhatsApp de vendas.", agora);
    await gravarNaConversa(lead.id, msg, agora);

    return {
      status: leitura.codigo && lead.codigo === leitura.codigo ? "RECONHECIDO_POR_CODIGO" : "RECONHECIDO_POR_TELEFONE",
      leadId: lead.id,
      codigo: lead.codigo,
      detalhe: leitura.codigo ? `código #${leitura.codigo}` : "reconhecido pelo telefone",
    };
  } catch (e) {
    console.error("[foocci-sdr] falha ao receber mensagem de vendas:", e);
    return {
      status: "FALHOU",
      leadId: null,
      codigo: null,
      detalhe: e instanceof Error ? e.message.slice(0, 200) : "erro desconhecido",
    };
  }
}

/**
 * Grava a mensagem na conversa do lead.
 *
 * ── POR QUE ELA NUNCA DERRUBA A RECEPÇÃO ────────────────────────────────────
 *
 * Um `catch` que engole erro costuma ser preguiça. Aqui é decisão: o contato já
 * foi reconhecido e a linha do tempo já registrou o movimento. Se a gravação da
 * conversa falhar, perder ISSO é ruim; devolver erro ao webhook e fazer a Meta
 * reentregar a mesma mensagem — que criaria contato duplicado nos caminhos
 * acima — é pior.
 *
 * A falha vai para o log com o motivo, nunca como silêncio (guardrail 6).
 *
 * Sem `waMessageId` não grava: sem ele a reentrega da Meta entraria de novo, e
 * a conversa mostraria a pessoa perguntando o preço duas vezes.
 */
async function gravarNaConversa(
  leadId: string,
  msg: MensagemDeVendas,
  agora: Date,
): Promise<void> {
  if (!msg.waMessageId) return;

  try {
    const r = await registrarEntrada(prisma, {
      leadId,
      waMessageId: msg.waMessageId,
      tipo: msg.tipo ?? "TEXTO",
      tipoCru: msg.tipoCru ?? null,
      texto: msg.text ?? null,
      legenda: msg.legenda ?? null,
      midiaId: msg.midiaId ?? null,
      midiaMimeType: msg.midiaMimeType ?? null,
      midiaNome: msg.midiaNome ?? null,
      duracaoSeg: msg.duracaoSeg ?? null,
      ocorreuEm: agora,
    });

    if (!r.ok) {
      console.error(`[foocci-sdr] mensagem NÃO gravada na conversa do lead ${leadId}: ${r.causa}`);
    }
  } catch (e) {
    console.error("[foocci-sdr] falha ao gravar mensagem na conversa:", e);
  }
}

// ─── Peças ──────────────────────────────────────────────────────────────────────

type LeadResumo = { id: string; codigo: string | null; optOutAt: Date | null };

/**
 * Acha o contato. Duas chaves, nesta ordem, e a ordem importa:
 *
 *  1. o `#código` — é o único elo EXATO entre este "oi" e o formulário que a
 *     pessoa acabou de preencher;
 *  2. o telefone — funciona sempre, mas casa pelo fim do número, o que tolera
 *     nono dígito e DDI e por isso é a segunda escolha, nunca a primeira.
 *
 * Não achar não afirma nada sobre a pessoa (guardrail 1): é só ausência de
 * registro, e o chamador trata como contato novo.
 */
async function encontrarLead(
  codigo: string | null,
  digitos: string | null,
  fromPhone: string,
): Promise<LeadResumo | null> {
  const select = { id: true, codigo: true, optOutAt: true } as const;

  if (codigo) {
    const porCodigo = await prisma.siteLead.findUnique({ where: { codigo }, select });
    if (porCodigo) return porCodigo;
  }

  const cauda = (digitos ?? fromPhone).replace(/\D/g, "").slice(-8);
  if (cauda.length < 8) return null;

  return prisma.siteLead.findFirst({
    where: { whatsappDigits: { contains: cauda } },
    orderBy: { createdAt: "desc" },
    select,
  });
}

/** Cria o contato de quem chegou direto pelo WhatsApp. Devolve null se falhar. */
async function criarContatoDeWhatsApp(
  msg: MensagemDeVendas,
  digitos: string | null,
  agora: Date,
  opts: { jaOptOut: boolean },
): Promise<LeadResumo | null> {
  try {
    const criado = await prisma.siteLead.create({
      data: {
        nome: (msg.profileName ?? "").trim() || msg.fromPhone,
        whatsapp: msg.fromPhone,
        whatsappDigits: digitos,
        fonte: "WHATSAPP_DIRETO",
        stage: "NOVO",
        // Escreveu primeiro: o consentimento é o próprio ato, e é datado aqui.
        // Para quem já chega pedindo silêncio não se registra consentimento nenhum.
        consentAt: opts.jaOptOut ? null : agora,
        lastInteractionAt: agora,
      },
      select: { id: true, codigo: true, optOutAt: true },
    });
    await registrarInteracao(
      criado.id,
      "CAPTURA",
      "Escreveu direto no WhatsApp de vendas, sem passar pelo formulário.",
      agora,
    );
    return criado;
  } catch (e) {
    console.error("[foocci-sdr] não consegui criar o contato de WhatsApp:", e);
    return null;
  }
}

/** A linha do tempo é append-only e best-effort: nunca derruba o recebimento. */
async function registrarInteracao(
  leadId: string,
  tipo: "CAPTURA" | "RESPOSTA_RECEBIDA" | "NOTA",
  nota: string,
  agora: Date,
): Promise<void> {
  await prisma.siteLeadInteraction
    .create({ data: { leadId, tipo, actor: "sistema", nota, createdAt: agora } })
    .catch((e) => console.error("[foocci-sdr] falha ao registrar interação:", e));
}
