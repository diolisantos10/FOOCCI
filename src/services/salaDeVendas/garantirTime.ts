/**
 * O TIME ESTÁ NO SISTEMA — não se põe, já está.
 *
 * ── A CORREÇÃO QUE ORIGINOU ESTE ARQUIVO ────────────────────────────────────
 *
 * A tela tinha um botão **"Pôr no sistema"**, um por agente. O CEO leu e
 * corrigiu, em 26/08/2026: *"os agentes já são parte do sistema. Eles não são
 * externos, eles fazem parte do sistema. Os humanos é que vão ter que fazer
 * login e entrar no sistema"*.
 *
 * Está certo, e o botão era o resto de uma ideia errada que já tinha sido
 * corrigida uma vez no mesmo dia. Primeiro eu dei **senha** ao agente, supondo
 * que ele usa tela. Tirei a senha e deixei o botão — ou seja, continuei
 * tratando-o como alguém que **chega de fora e precisa ser admitido**.
 *
 * Ele não chega. Ele é peça: existe porque o sistema existe, do mesmo jeito que
 * a fila existe, ou o funil. Ninguém "põe a fila no sistema".
 *
 * ── A DIFERENÇA PRÁTICA, QUE NÃO É FILOSÓFICA ───────────────────────────────
 *
 * Com botão, o time só existe se alguém lembrar de clicar. E o dia em que
 * ninguém clicou é o dia em que um lead chega para um agente que **não tem
 * registro** — e a atribuição falha por chave estrangeira, em produção, no meio
 * de um atendimento.
 *
 * Sem botão, essa falha não tem como acontecer: quem precisa do time chama esta
 * função, e ela garante que ele está lá.
 *
 * ── POR QUE NÃO É UM SEED DE MIGRAÇÃO ───────────────────────────────────────
 *
 * Seed roda uma vez, no deploy. Se a lista ganhar um sexto agente amanhã, o
 * banco de produção fica com cinco até alguém lembrar de rodar de novo — e o
 * sintoma seria "o Agente 6 não aparece", investigado como bug de tela.
 *
 * Esta função é idempotente e barata: uma leitura, e escrita só do que falta.
 * No caso comum — todos já lá — ela custa uma consulta e não escreve nada.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  TIME_DE_AGENTES,
  PAPEL_DO_TIME,
  DEPARTAMENTOS_DO_TIME,
} from "./timeDeAgentes";

type Cliente = PrismaClient | Prisma.TransactionClient;

export interface TimeGarantido {
  /** Quantos já estavam lá. */
  jaEstavam: number;
  /** Quantos foram criados agora. Zero é o caso normal. */
  criados: number;
}

/**
 * Garante que os agentes do time existem, e devolve o que mudou.
 *
 * **Nunca lança para quem chama.** É chamada em caminho de leitura de tela: se
 * o banco recusar a escrita, é melhor a tela abrir com o time incompleto do que
 * não abrir. O número devolvido diz a verdade sobre o que deu certo.
 *
 * ⚠️ Não escreve senha. O papel é `AGENTE_IA`, que `autenticarInterno` recusa
 * mesmo com hash gravado — e este arquivo não tem como gravar um.
 */
export async function garantirTimeNoSistema(db: Cliente): Promise<TimeGarantido> {
  const emails = TIME_DE_AGENTES.map((a) => a.email);

  let dentro: Set<string>;
  try {
    const existentes = await db.internalUser.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    });
    dentro = new Set(existentes.map((u) => u.email));
  } catch {
    // ⚠️ A leitura é a única coisa que roda antes do laço, e ela precisa do
    // mesmo cuidado que ele. Sem este `catch` a promessa acima ("nunca lança")
    // seria falsa exatamente no caso que ela existe para cobrir: banco fora do
    // ar derrubaria a tela do agente inteira — e essa tela existe para mostrar
    // o interruptor do TA, que importa mais que a lista.
    return { jaEstavam: 0, criados: 0 };
  }

  const faltando = TIME_DE_AGENTES.filter((a) => !dentro.has(a.email));

  // O caminho comum: todos já estão. Uma consulta, nenhuma escrita.
  if (faltando.length === 0) {
    return { jaEstavam: dentro.size, criados: 0 };
  }

  let criados = 0;
  for (const a of faltando) {
    try {
      const user = await db.internalUser.upsert({
        where: { email: a.email },
        // O update é vazio de propósito. Se o registro existe, ele é a verdade —
        // e sobrescrever `isActive` aqui reativaria um agente que alguém
        // desligou de propósito, toda vez que a tela abrisse.
        update: {},
        create: { email: a.email, nome: a.nome, role: PAPEL_DO_TIME },
      });

      for (const slug of DEPARTAMENTOS_DO_TIME) {
        const dep = await db.department.findUnique({
          where: { slug },
          select: { id: true },
        });
        if (!dep) continue; // departamento ausente não impede o agente de existir
        await db.departmentMembership.upsert({
          where: {
            internalUserId_departmentId: { internalUserId: user.id, departmentId: dep.id },
          },
          update: {},
          create: { internalUserId: user.id, departmentId: dep.id, isManager: false },
        });
      }

      criados += 1;
    } catch {
      // Um agente que não entrou não impede os outros. A tela abre com o que
      // deu, e o número devolvido não mente sobre quantos são.
    }
  }

  return { jaEstavam: dentro.size, criados };
}
