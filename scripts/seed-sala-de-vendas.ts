/**
 * SEMEIA O QUE A SALA DE VENDAS PRECISA PARA OPERAR.
 *
 *   npx tsx scripts/seed-sala-de-vendas.ts
 *
 * ── O QUE ELE CRIA ──────────────────────────────────────────────────────────
 *
 *   1. O catálogo de MOTIVOS DE PERDA. Sem ele nenhum lead pode ser marcado
 *      como perdido — a regra do funil exige motivo estruturado, e um catálogo
 *      vazio trava a operação no primeiro "não".
 *   2. A CONFIGURAÇÃO DO TA, **desligada**.
 *   3. Uma CADÊNCIA de retomada, **inativa**.
 *
 * ── O QUE ELE NÃO CRIA, E NUNCA VAI CRIAR ───────────────────────────────────
 *
 * Lead nenhum. Nem de exemplo, nem de demonstração.
 *
 * Um lead falso numa base comercial é indistinguível de um lead real três
 * semanas depois — e alguém vai ligar para ele. Pior: ele entra na contagem do
 * funil e na taxa de conversão, e a partir daí todo número da tela carrega uma
 * mentira que ninguém consegue mais separar.
 *
 * ── IDEMPOTENTE ─────────────────────────────────────────────────────────────
 *
 * Roda quantas vezes for preciso. Um seed que só funciona uma vez quebra
 * exatamente quando alguém precisa reaplicá-lo — que é sempre no pior dia.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Os motivos de perda.
 *
 * Agrupados porque a pergunta que o relatório responde não é "quantos disseram
 * que estava caro" — é "quanto perdemos por PREÇO". Sem grupo, cinco motivos
 * próximos aparecem como cinco linhas pequenas e o padrão some.
 *
 * "Outro" exige detalhe. Sem essa trava ele vira o maior motivo de perda da
 * empresa em dois meses, e não explica coisa nenhuma.
 */
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

async function main() {
  console.log("\n── Semeando a Sala de Vendas ──\n");

  const motivos = await semearMotivos();
  console.log(`  ✓ ${motivos} motivos de perda no catálogo`);

  const ta = await semearConfigDoTA();
  console.log(
    ta === "criada"
      ? "  ✓ configuração do TA criada — DESLIGADA"
      : "  · configuração do TA já existia — não foi tocada",
  );

  const cadencia = await semearCadencia();
  console.log(
    cadencia === "criada"
      ? "  ✓ cadência de retomada criada — INATIVA"
      : "  · cadência de retomada já existia — não foi tocada",
  );

  // O estado que interessa conferir depois: nada ligado.
  const ligado = await prisma.sdrIaConfig.count({ where: { ligado: true } });
  const cadenciasAtivas = await prisma.cadencia.count({ where: { ativa: true } });

  console.log(
    `\n  Agentes de IA ligados: ${ligado} · cadências ativas: ${cadenciasAtivas}`,
  );
  console.log("  Nenhum lead foi criado. Base de vendas não recebe dado falso.\n");
}

main()
  .catch((e) => {
    console.error("Seed falhou:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
