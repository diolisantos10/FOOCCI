/**
 * Captura de contato do site comercial — a PORTA DE ENTRADA do CRM da Foocci.
 *
 * ⚠️ O DESTINO MUDOU. Este serviço já foi "salva e manda e-mail". Hoje ele
 * alimenta a base de prospects da Foocci (`/admin/foocci-crm`), e o e-mail é
 * conveniência: um aviso que pode falhar sem consequência. Quem trabalha o
 * contato é a tela; quem guarda é a tabela. Ver `src/services/foocci-crm/`.
 *
 * A ORDEM IMPORTA E É O PONTO INTEIRO: grava primeiro, notifica depois. Um
 * contato que chegou ao banco nunca se perde, aconteça o que acontecer com o
 * e-mail.
 *
 * DUAS COISAS NOVAS, E POR QUÊ:
 *
 *  • **Origem de verdade.** Além do `origem` legado (a página do formulário),
 *    grava o primeiro toque (utm, click id, landing, referrer) que o site carrega
 *    desde a página de entrada. Sem isso não há como saber qual anúncio funciona
 *    — e `origem` sozinho só sabia dizer "veio do formulário", que é sempre.
 *
 *  • **Um contato por pessoa.** Reenvio do mesmo WhatsApp NÃO cria contato novo:
 *    vira uma interação REENVIO_FORMULARIO no histórico e completa os campos que
 *    estavam vazios. Base com a mesma pessoa três vezes faz o SDR abordar três
 *    vezes. Nada se perde: a segunda passada é um evento datado.
 *    Se a busca por duplicata falhar por qualquer motivo, o código CRIA — perder
 *    contato é pior que duplicar, e essa continua sendo a regra de desempate.
 *
 * O e-mail sai pela API HTTP do Resend via `fetch`, deliberadamente SEM SDK: o
 * payload são três campos e uma dependência aqui teria que ser instalada, mantida
 * em `dependencies` e auditada — para um POST.
 *
 * Degrada com honestidade quando não configurado: sem `RESEND_API_KEY` ou
 * `LEADS_NOTIFY_EMAIL` o contato é gravado do mesmo jeito e `notifyError` registra
 * exatamente por que nenhum aviso saiu. Guardrail 6.
 */

import { prisma } from "@/lib/prisma";
import { generateLeadCode } from "@/lib/site/leadCode";
import type { CreateSiteLeadInput } from "@/validators/site-lead";
import { normalizaWhatsapp } from "@/services/foocci-crm/leadOrigin";
import { analisarWhatsappBr } from "@/lib/whatsapp-br";
import { analisarEmail } from "@/lib/email-contato";

/** Sender identity. Resend's shared onboarding domain works with zero DNS setup. */
const FROM = process.env.LEADS_FROM_EMAIL || "Foocci <onboarding@resend.dev>";

/** Tentativas de código antes de desistir DO CÓDIGO (nunca do lead). */
const CODE_ATTEMPTS = 4;

export interface CreatedLead {
  id: string;
  /** Código curto que vai na mensagem do WhatsApp; `null` se não deu para gerar. */
  codigo: string | null;
  notified: boolean;
  notifyError: string | null;
  /** true quando o envio caiu num contato que já existia na base. */
  duplicado: boolean;
}

function ouNulo(v: string | undefined | null): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
}

export const SiteLeadService = {
  /**
   * Grava o contato, depois tenta notificar. Nunca lança por falha de
   * notificação — o visitante já entregou o dado e precisa ver a tela de sucesso.
   *
   * A ORDEM CONTINUA SENDO O PONTO, e agora ela vale para três coisas: gravar,
   * depois avisar, e só então o visitante ser levado ao WhatsApp. Quem leva ao
   * WhatsApp é a tela, e ela só faz isso com o `codigo` que este método devolve —
   * ou seja, só depois da gravação ter acontecido de verdade.
   */
  async capture(input: CreateSiteLeadInput): Promise<CreatedLead> {
    /* A chave humana do contato. Quem manda é `analisarWhatsappBr` — o mesmo
     * analisador que o validador da entrada usa, então o que foi aceito na porta
     * SEMPRE vira chave. O `normalizaWhatsapp` fica de reserva por compatibilidade
     * com quem chamar este serviço fora da rota do site.
     *
     * Por que a troca importa: o antigo devolvia `null` para "(55) 99999-8888"
     * (Santa Maria/RS — ele tira o "55" achando que é DDI) e para "011 98765-4321"
     * (o zero da operadora). `null` aqui desliga a busca de duplicata E deixa o
     * contato sem link de conversa no CRM — o lead entra, mas chega mudo. */
    const analise = analisarWhatsappBr(input.whatsapp);
    const whatsappDigits = analise.ok ? analise.digitos : normalizaWhatsapp(input.whatsapp);

    /* O e-mail é guardado NORMALIZADO (sem espaço nas pontas, domínio minúsculo)
     * pelo mesmo motivo do WhatsApp: o que quem atende vê tem de ser o que dá
     * para usar. "  Contato@Nonna.COM.BR " copiado de um documento é o mesmo
     * endereço que "contato@nonna.com.br", e guardar os dois faz a base parecer
     * ter duas pessoas. Se por algum motivo não der para ler (só acontece se
     * alguém chamar este serviço por fora da rota, que valida antes), grava o
     * texto cru: perder o contato é sempre o pior resultado. */
    const emailLido = analisarEmail(input.email);
    const email = emailLido.ok ? emailLido.normalizado : ouNulo(input.email);

    const existente = whatsappDigits ? await buscaDuplicata(whatsappDigits) : null;

    let leadId: string;
    let codigo: string | null = null;
    let duplicado = false;

    if (existente) {
      duplicado = true;
      leadId = existente.id;
      codigo = existente.codigo ?? null;
      const agora = new Date();

      await prisma.$transaction([
        prisma.siteLead.update({
          where: { id: existente.id },
          data: {
            // Só COMPLETA o que faltava. O reenvio não apaga o que a pessoa já
            // havia informado — um segundo envio apressado costuma vir com menos
            // campos, e sobrescrever perderia informação boa.
            nome:        existente.nome || input.nome,
            // Contato da primeira safra (antes de 08/08) não tem e-mail: o
            // reenvio é a chance de completar. Quem já tinha não é sobrescrito.
            email:       existente.email ?? email,
            restaurante: existente.restaurante ?? ouNulo(input.restaurante),
            cidade:      existente.cidade      ?? ouNulo(input.cidade),
            tipo:        existente.tipo        ?? ouNulo(input.tipo),
            desafio:     existente.desafio     ?? ouNulo(input.desafio),
            // Origem também é primeiro toque: só grava se estava vazia.
            utmSource:   existente.utmSource   ?? ouNulo(input.utmSource),
            utmMedium:   existente.utmMedium   ?? ouNulo(input.utmMedium),
            utmCampaign: existente.utmCampaign ?? ouNulo(input.utmCampaign),
            utmContent:  existente.utmContent  ?? ouNulo(input.utmContent),
            utmTerm:     existente.utmTerm     ?? ouNulo(input.utmTerm),
            clickId:     existente.clickId     ?? ouNulo(input.clickId),
            landingPath: existente.landingPath ?? ouNulo(input.landingPath),
            referrer:    existente.referrer    ?? ouNulo(input.referrer),
            submissions: { increment: 1 },
            lastInteractionAt: agora,
          },
        }),
        prisma.siteLeadInteraction.create({
          data: {
            leadId: existente.id,
            tipo: "REENVIO_FORMULARIO",
            actor: "sistema",
            nota: `Preencheu o formulário de novo em ${ouNulo(input.origem) ?? "página não informada"}.`,
            createdAt: agora,
          },
        }),
      ]);

      // Contato antigo, gravado antes do código existir: ganha um agora. Sem isso,
      // o reenvio de um lead da primeira safra iria ao WhatsApp sem código e o
      // atendimento perderia a ligação justamente com quem já demonstrou interesse
      // duas vezes.
      if (codigo === null) codigo = await atribuiCodigo(leadId);
    } else {
      const criado = await createWithCode(input, whatsappDigits, email);
      leadId = criado.id;
      codigo = criado.codigo;

      // A linha do tempo começa aqui. Nunca deixe um contato sem evento de
      // entrada: o SDR lê o histórico, e histórico vazio parece contato órfão.
      await prisma.siteLeadInteraction
        .create({
          data: {
            leadId,
            tipo: "CAPTURA",
            toStage: "NOVO",
            actor: "sistema",
            nota: `Formulário do site${ouNulo(input.origem) ? ` em ${ouNulo(input.origem)}` : ""}.`,
          },
        })
        .catch((e) => {
          // O contato já está salvo — a linha do tempo não pode derrubar a captura.
          console.error("[site-lead] falha ao registrar a interação de captura:", e);
        });
    }

    // O aviso leva o e-mail NORMALIZADO, não o texto cru: quem abre o aviso
    // costuma responder clicando no endereço, e um espaço a mais quebra o link.
    const error = await notify({ ...input, email: email ?? input.email, codigo });

    await prisma.siteLead.update({
      where: { id: leadId },
      data: error ? { notifyError: error } : { notifiedAt: new Date(), notifyError: null },
    });

    return { id: leadId, codigo, notified: error === null, notifyError: error, duplicado };
  },
};

/**
 * Procura contato existente com o mesmo WhatsApp.
 *
 * Falha aqui NUNCA impede a gravação: devolve null e o fluxo cria um contato
 * novo. É a aplicação literal de "perder contato é pior que duplicar".
 */
async function buscaDuplicata(whatsappDigits: string) {
  try {
    return await prisma.siteLead.findFirst({
      where: { whatsappDigits },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, nome: true, codigo: true, email: true, restaurante: true, cidade: true,
        tipo: true, desafio: true,
        utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true,
        utmTerm: true, clickId: true, landingPath: true, referrer: true,
      },
    });
  } catch (e) {
    console.error("[site-lead] busca de duplicata falhou; seguindo com contato novo:", e);
    return null;
  }
}

/**
 * Dá um código a um contato que ainda não tem. Devolve `null` se não conseguir —
 * e `null` aqui significa exatamente "sem código", nunca "sem contato": a tela
 * cai no plano B (copiar número e mensagem) e ninguém se perde.
 */
async function atribuiCodigo(leadId: string): Promise<string | null> {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const codigo = generateLeadCode();
    try {
      await prisma.siteLead.update({ where: { id: leadId }, data: { codigo } });
      return codigo;
    } catch (e) {
      if (!isCodigoCollision(e)) {
        console.error("[site-lead] não deu para atribuir código ao contato existente:", e);
        return null;
      }
      console.warn("[site-lead] código já existia ao completar contato antigo", { attempt, codigo });
    }
  }
  return null;
}

/**
 * Grava o lead com um código único — e, se o código for o problema, grava sem ele.
 *
 * O UNIQUE do banco é a trava contra colisão (checar antes com um SELECT não
 * resolve corrida entre dois visitantes no mesmo milissegundo). Se as tentativas
 * se esgotarem, a última gravação vai com `codigo: null`: o atendimento perde o
 * contexto automático, o que é ruim; perder o lead seria pior, e é o único
 * resultado que este código não aceita.
 */
async function createWithCode(
  input: CreateSiteLeadInput,
  whatsappDigits: string | null,
  email: string | null,
): Promise<{ id: string; codigo: string | null }> {
  const base = {
    nome:        input.nome,
    whatsapp:    input.whatsapp,
    whatsappDigits,
    email,
    restaurante: ouNulo(input.restaurante),
    cidade:      ouNulo(input.cidade),
    tipo:        ouNulo(input.tipo),
    desafio:     ouNulo(input.desafio),
    origem:      ouNulo(input.origem),
    utmSource:   ouNulo(input.utmSource),
    utmMedium:   ouNulo(input.utmMedium),
    utmCampaign: ouNulo(input.utmCampaign),
    utmContent:  ouNulo(input.utmContent),
    utmTerm:     ouNulo(input.utmTerm),
    clickId:     ouNulo(input.clickId),
    landingPath: ouNulo(input.landingPath),
    referrer:    ouNulo(input.referrer),
    fonte:       "FORMULARIO_DEMONSTRACAO" as const,
    stage:       "NOVO" as const,
    lastInteractionAt: new Date(),
  };

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const codigo = generateLeadCode();
    try {
      const row = await prisma.siteLead.create({ data: { ...base, codigo }, select: { id: true } });
      return { id: row.id, codigo };
    } catch (e) {
      // Só colisão de código é motivo para tentar de novo. Banco fora do ar sobe na
      // hora: insistir 4 vezes num banco caído só atrasa o erro que o visitante
      // precisa ver — e arrisca gravar duplicata se a falha for depois do commit.
      if (!isCodigoCollision(e)) throw e;
      // Guardrail 6: se um dia isto virar recorrente, o log tem o caso concreto.
      console.warn("[site-lead] código já existia, gerando outro", { attempt, codigo });
    }
  }

  console.error("[site-lead] 4 colisões seguidas de código — lead salvo SEM código", {
    restaurante: base.restaurante,
  });
  const row = await prisma.siteLead.create({ data: { ...base, codigo: null }, select: { id: true } });
  return { id: row.id, codigo: null };
}

/** Erro do Prisma de violação de UNIQUE apontando para a coluna `codigo`. */
function isCodigoCollision(e: unknown): boolean {
  const err = e as { code?: string; meta?: { target?: unknown } } | null;
  if (err?.code !== "P2002") return false;
  const target = err.meta?.target;
  const alvo = Array.isArray(target) ? target.join(",") : String(target ?? "");
  return alvo.includes("codigo");
}

/** Returns null on success, or a short human-readable reason on failure. */
async function notify(lead: CreateSiteLeadInput & { codigo: string | null }): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.LEADS_NOTIFY_EMAIL;

  if (!apiKey) return "RESEND_API_KEY ausente — lead salvo, aviso não enviado";
  if (!to) return "LEADS_NOTIFY_EMAIL ausente — lead salvo, aviso não enviado";

  const linhas = [
    // O código vem primeiro de propósito: é por ele que quem atende reconhece a
    // mensagem que vai chegar no WhatsApp e liga uma coisa na outra.
    lead.codigo ? `Código: #${lead.codigo}` : "Código: — (não gerado)",
    `Nome: ${lead.nome}`,
    `WhatsApp: ${lead.whatsapp}`,
    // O segundo caminho de volta vai no aviso, ao lado do primeiro. Se o WhatsApp
    // não alcançar, quem lê já tem por onde responder sem abrir o CRM.
    `E-mail: ${lead.email}`,
    lead.restaurante ? `Restaurante: ${lead.restaurante}` : null,
    lead.cidade ? `Cidade: ${lead.cidade}` : null,
    lead.tipo ? `Tipo: ${lead.tipo}` : null,
    lead.desafio ? `Principal desafio: ${lead.desafio}` : null,
    lead.utmCampaign ? `Campanha: ${lead.utmCampaign}` : null,
    lead.utmSource ? `Canal: ${lead.utmSource}` : null,
    lead.origem ? `Veio de: ${lead.origem}` : null,
  ].filter(Boolean);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: `🍽️ Novo pedido de demonstração — ${lead.nome}`,
        text: `${linhas.join("\n")}\n\nAbra no CRM da Foocci: /admin/foocci-crm\nResponda pelo WhatsApp: ${lead.whatsapp}\nOu por e-mail: ${lead.email}`,
      }),
      // A slow provider must not hold the visitor's request open.
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return `Resend ${res.status}: ${body.slice(0, 200)}`;
    }
    return null;
  } catch (e) {
    return `falha ao chamar o Resend: ${e instanceof Error ? e.message : String(e)}`;
  }
}
