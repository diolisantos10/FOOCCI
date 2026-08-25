/**
 * O QUE A SALA DE VENDAS PRECISA PARA FUNCIONAR — semeadura idempotente.
 *
 * ── POR QUE ISTO SAIU DE DENTRO DO SCRIPT (25/08/2026) ──────────────────────
 *
 * A lógica vivia em `scripts/seed-sala-de-vendas.ts`, e rodá-la em produção
 * exigia terminal no ambiente. Sem ela, **nenhum lead pode ser marcado como
 * perdido**: a regra do funil exige motivo estruturado, e o catálogo de motivos
 * nasce vazio.
 *
 * Esta casa já resolve isso do mesmo jeito duas vezes — `seed-howtos` e
 * `demo-bakery/self-seed` são chamados por `start-production.sh` depois que o
 * servidor sobe. Para a Sala entrar no mesmo molde, a semeadura precisava ser
 * chamável de uma rota, e não só de um `argv`.
 *
 * O script continua existindo e continua sendo o caminho de quem tem terminal.
 * Ele passou a **chamar** isto — não a repetir: duas cópias da semeadura
 * divergiriam no dia em que alguém acrescentasse um motivo de perda em uma só.
 *
 * ── O QUE ELA NUNCA FAZ ─────────────────────────────────────────────────────
 *
 * **Não cria lead.** Um lead falso numa base comercial é indistinguível de um
 * real três semanas depois, e alguém vai ligar para ele. Pior: entra na
 * contagem do funil e contamina toda taxa da tela.
 *
 * **Não liga nada.** O TA nasce desligado e a semeadura não o religa. Ligar e
 * desligar é ato humano, das duas direções.
 */

import { prisma } from "@/lib/prisma";

const MOTIVOS: ReadonlyArray<{
  slug: string;
  rotulo: string;
  grupo: string;
  exigeDetalhe?: boolean;
}> = [
  { slug: "preco-alto", rotulo: "Achou caro", grupo: "preço" },
  { slug: "sem-verba", rotulo: "Sem verba agora", grupo: "preço" },
  { slug: "concorrente", rotulo: "Fechou com concorrente", grupo: "concorrência", exigeDetalhe: true },
  { slug: "ja-tem-sistema", rotulo: "Já tem sistema e não quer trocar", grupo: "concorrência" },
  { slug: "falta-recurso", rotulo: "Falta um recurso que ele precisa", grupo: "produto", exigeDetalhe: true },
  { slug: "nao-e-publico", rotulo: "Não é restaurante / fora do público", grupo: "perfil" },
  { slug: "porte-pequeno", rotulo: "Porte pequeno demais", grupo: "perfil" },
  { slug: "sem-resposta", rotulo: "Parou de responder", grupo: "contato" },
  { slug: "telefone-errado", rotulo: "Contato inválido", grupo: "contato" },
  { slug: "fechou-a-loja", rotulo: "Fechou o restaurante", grupo: "perfil" },
  { slug: "outro", rotulo: "Outro", grupo: "outro", exigeDetalhe: true },
];

async function semearMotivos(): Promise<number> {
  let n = 0;

  for (const [i, m] of MOTIVOS.entries()) {
    await prisma.motivoDePerda.upsert({
      where: { slug: m.slug },
      create: {
        slug: m.slug,
        rotulo: m.rotulo,
        grupo: m.grupo,
        exigeDetalhe: m.exigeDetalhe ?? false,
        ordem: i,
        ativo: true,
      },
      // O rótulo é atualizado; `ativo` NÃO. Se alguém desativou um motivo à mão,
      // reaplicar o seed não pode ressuscitá-lo — desativar foi uma decisão.
      update: {
        rotulo: m.rotulo,
        grupo: m.grupo,
        exigeDetalhe: m.exigeDetalhe ?? false,
        ordem: i,
      },
    });
    n += 1;
  }

  return n;
}

/**
 * A configuração do TA — **desligada**.
 *
 * `ligado: false` no create, e o update NÃO mexe nesse campo. Se o CEO ligar o
 * TA e alguém reaplicar o seed, o agente não pode ser desligado por baixo dos
 * panos — nem religado. Ligar e desligar é ato humano, das duas direções.
 */
async function semearConfigDoTA(): Promise<"criada" | "mantida"> {
  const existente = await prisma.sdrIaConfig.findUnique({
    where: { slug: "ta" },
    select: { id: true },
  });

  if (existente) return "mantida";

  await prisma.sdrIaConfig.create({
    data: {
      slug: "ta",
      nome: "TA",
      ligado: false,
      distribuicao: "MANUAL",
      horaInicio: 9,
      horaFim: 20,
      maxSemResposta: 3,
      scoreParaHumano: 70,
      slaPrimeiraRespostaMin: 15,
      slaEsperaPorGenteMin: 10,
    },
  });

  return "criada";
}

/**
 * Uma cadência de retomada, **inativa**.
 *
 * Nasce inativa porque cadência ativa dispara toque de verdade. Ela existe para
 * o time ver a forma e ajustar antes de ligar — e não para começar a cobrar
 * ninguém no dia em que a migração rodar.
 */
const PASSOS: ReadonlyArray<{
  ordem: number;
  esperaHoras: number;
  titulo: string;
  roteiro: string;
}> = [
  { ordem: 0, esperaHoras: 24, titulo: "Retomar — 1º toque", roteiro: "Retomar a conversa lembrando o que ele contou." },
  { ordem: 1, esperaHoras: 72, titulo: "Retomar — 2º toque", roteiro: "Trazer um caso parecido com o restaurante dele." },
  { ordem: 2, esperaHoras: 168, titulo: "Último toque", roteiro: "Perguntar se faz sentido retomar mais para a frente. Se não, mover para nutrição." },
];

async function semearCadencia(): Promise<"criada" | "mantida"> {
  const existente = await prisma.cadencia.findUnique({
    where: { slug: "retomada-sem-resposta" },
    select: { id: true },
  });

  if (existente) return "mantida";

  await prisma.cadencia.create({
    data: {
      slug: "retomada-sem-resposta",
      nome: "Retomada de quem parou de responder",
      ativa: false,
      quando: "lead sem resposta há mais de 24 h, com o funil ainda aberto",
      passos: {
        create: PASSOS.map((p) => ({
          ordem: p.ordem,
          esperaHoras: p.esperaHoras,
          titulo: p.titulo,
          roteiro: p.roteiro,
          tipo: "FOLLOW_UP",
          executor: "HUMANO",
        })),
      },
    },
  });

  return "criada";
}

export interface ResultadoDaSemeadura {
  motivos: number;
  configDoTA: "criada" | "mantida";
  cadencia: "criada" | "mantida";
  /** O estado que interessa conferir depois: nada ligado. */
  agentesLigados: number;
  cadenciasAtivas: number;
}

export async function semearSalaDeVendas(): Promise<ResultadoDaSemeadura> {
  const motivos = await semearMotivos();
  const configDoTA = await semearConfigDoTA();
  const cadencia = await semearCadencia();

  return {
    motivos,
    configDoTA,
    cadencia,
    agentesLigados: await prisma.sdrIaConfig.count({ where: { ligado: true } }),
    cadenciasAtivas: await prisma.cadencia.count({ where: { ativa: true } }),
  };
}
