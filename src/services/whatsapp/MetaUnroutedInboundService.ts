/**
 * MetaUnroutedInboundService — a evidência de que um cliente falou com uma porta
 * sem dono.
 *
 * A Meta entrega o webhook carimbado com um `phone_number_id`. Quando nenhum
 * restaurante reconhece esse id, não dá para gravar a mensagem: sem dono, atribuir a
 * um restaurante qualquer seria mensagem de cliente aparecendo na tela de OUTRO
 * negócio — vazamento entre inquilinos, que é pior que o problema original.
 *
 * O que se pode fazer, e é o que este módulo faz: guardar **o rastro**, para que a
 * pergunta "estamos perdendo mensagem?" tenha resposta em vez de opinião.
 *
 * ── Por que isto existe, com o custo medido ─────────────────────────────────────
 * Até 13/08/2026 esse caso era um `console.warn` em `webhooks/meta/whatsapp/route.ts`
 * — e a retenção de log do Railway é por deploy, então a explicação morria antes de
 * alguém procurar. Em 12/08 um restaurante trocou de chip; o `phone_number_id`
 * gravado continuou apontando para o número velho e TODA mensagem que entrava sumia
 * ali. A tela ficou verde o tempo todo. O CEO descobriu no dia seguinte, pelas
 * vendas: *"as vendas caíram"*.
 *
 * ── As quatro decisões de desenho ───────────────────────────────────────────────
 *
 *  1. **Agregado por número, não por mensagem.** Uma linha por `phone_number_id`,
 *     com contador. É o teto de volume embutido na FORMA da tabela: uma enxurrada
 *     incrementa um inteiro, não cria linha nova. Teto que depende de alguém lembrar
 *     de aplicar é teto que falha no dia em que importa.
 *
 *  2. **Teto também no número de números distintos** (`MAX_TRACKED_NUMBERS`). O
 *     webhook só aceita payload com assinatura válida do nosso app
 *     (`route.ts` valida `x-hub-signature-256` antes de chegar aqui), então tráfego
 *     forjado não passa. Ainda assim o teto existe: uma conta com dezenas de números
 *     mal configurados não pode virar crescimento sem fim de tabela.
 *
 *  3. **Nada de dado sensível.** Sem conteúdo de mensagem, sem telefone de cliente em
 *     claro, sem `restaurantId` adivinhado. O `displayPhoneNumber` guardado é o número
 *     DO NEGÓCIO (vem de `value.metadata`), e é justamente ele que responde a pergunta
 *     útil: *qual* número ficou órfão.
 *
 *  4. **Registrar NUNCA pode derrubar o webhook.** Toda falha aqui é engolida. A
 *     Meta desativa a inscrição de quem não responde 200, e perder o canal inteiro
 *     para conseguir gravar um diagnóstico seria a proteção mais destrutiva que o
 *     problema (guardrail 5).
 */

import { prisma } from "@/lib/prisma";

/**
 * Quantos `phone_number_id` órfãos distintos rastreamos. Passando disso, novos
 * números só entram no log — os já rastreados continuam contando normalmente.
 *
 * 50 é folgado para o problema real (um restaurante que trocou de chip gera UM) e
 * apertado o bastante para nunca virar tabela grande.
 */
export const MAX_TRACKED_NUMBERS = 50;

/** "+55***4947" — reconhecível como gente real, inútil para identificar alguém. */
export function maskFromPhone(phone: string): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `+${digits.slice(0, 2)}***${digits.slice(-4)}`;
}

export interface UnroutedInboundEvent {
  phoneNumberId:      string;
  displayPhoneNumber?: string | null;
  fromPhone?:          string | null;
  seenAt?:             Date;
}

/** Uma porta sem dono, do jeito que o operador precisa ver. */
export interface UnroutedInboundView {
  phoneNumberId:      string;
  displayPhoneNumber: string | null;
  messageCount:       number;
  firstSeenAt:        string;
  lastSeenAt:         string;
  lastMaskedFrom:     string | null;
}

export const MetaUnroutedInboundService = {
  /**
   * Registra uma mensagem que chegou e não teve dono. Best-effort e silencioso em
   * caso de falha — ver decisão 4 no cabeçalho.
   *
   * Devolve `true` quando gravou, `false` quando não gravou (teto atingido ou erro).
   * O retorno existe para os testes; o webhook ignora.
   */
  async record(event: UnroutedInboundEvent): Promise<boolean> {
    const phoneNumberId = String(event.phoneNumberId ?? "").trim();
    if (!phoneNumberId) return false;

    const agora  = event.seenAt ?? new Date();
    const masked = event.fromPhone ? maskFromPhone(event.fromPhone) : null;

    try {
      // Já rastreado? Então só contar — nunca esbarra no teto, porque não cresce.
      const existente = await prisma.metaUnroutedInbound.findUnique({
        where:  { phoneNumberId },
        select: { id: true },
      });

      if (existente) {
        await prisma.metaUnroutedInbound.update({
          where: { phoneNumberId },
          data: {
            messageCount: { increment: 1 },
            lastSeenAt:   agora,
            // Só sobrescreve com informação real: um payload sem esses campos não
            // pode APAGAR o que um payload anterior já tinha ensinado.
            ...(masked ? { lastMaskedFrom: masked } : {}),
            ...(event.displayPhoneNumber ? { displayPhoneNumber: event.displayPhoneNumber } : {}),
          },
        });
        return true;
      }

      // Número novo: aí sim o teto vale.
      const rastreados = await prisma.metaUnroutedInbound.count();
      if (rastreados >= MAX_TRACKED_NUMBERS) {
        console.warn(
          `[meta-unrouted] teto de ${MAX_TRACKED_NUMBERS} números órfãos atingido — ` +
          `phone_number_id=${phoneNumberId} NÃO rastreado. Resolva os números já listados em /api/admin/meta/diag.`,
        );
        return false;
      }

      await prisma.metaUnroutedInbound.create({
        data: {
          phoneNumberId,
          displayPhoneNumber: event.displayPhoneNumber ?? null,
          messageCount:       1,
          firstSeenAt:        agora,
          lastSeenAt:         agora,
          lastMaskedFrom:     masked,
        },
      });
      return true;
    } catch (err) {
      // Corrida entre dois webhooks simultâneos cai aqui (unique violado) e é
      // aceitável: perder a contagem de UMA mensagem não muda o diagnóstico.
      console.error("[meta-unrouted] não consegui registrar a mensagem sem dono", {
        phoneNumberId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  },

  /**
   * As portas sem dono que AINDA são problema.
   *
   * Um número deixa de aparecer no instante em que alguém o conecta a um restaurante
   * — a checagem é feita aqui, na leitura, contra `MetaWhatsAppConfig`. É de propósito
   * que não exista um campo "resolvido" para alguém marcar na mão: estado que precisa
   * ser mantido por gente diverge do mundo, e um alerta que continua acendendo depois
   * de resolvido ensina o operador a ignorá-lo.
   *
   * A linha histórica continua na tabela para perícia; ela só não conta como aberta.
   */
  async listOpen(): Promise<UnroutedInboundView[]> {
    const linhas = await prisma.metaUnroutedInbound.findMany({
      orderBy: { lastSeenAt: "desc" },
      take:    MAX_TRACKED_NUMBERS,
    });
    if (linhas.length === 0) return [];

    const conhecidos = await prisma.metaWhatsAppConfig.findMany({
      where:  { phoneNumberId: { in: linhas.map((l) => l.phoneNumberId) } },
      select: { phoneNumberId: true },
    });
    const jaResolvidos = new Set(conhecidos.map((c) => c.phoneNumberId));

    return linhas
      .filter((l) => !jaResolvidos.has(l.phoneNumberId))
      .map((l) => ({
        phoneNumberId:      l.phoneNumberId,
        displayPhoneNumber: l.displayPhoneNumber,
        messageCount:       l.messageCount,
        firstSeenAt:        l.firstSeenAt.toISOString(),
        lastSeenAt:         l.lastSeenAt.toISOString(),
        lastMaskedFrom:     l.lastMaskedFrom,
      }));
  },
};
