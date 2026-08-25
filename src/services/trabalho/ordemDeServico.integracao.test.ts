import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { abrirOrdemDeServico } from "./ordemDeServico";

/**
 * "Tudo ou nada", contra banco real.
 *
 * A parte que só o banco pode provar é o ROLLBACK. Uma OS que gravou e cujas
 * tarefas falharam no meio produziria trabalho pela metade — com número e tudo,
 * esperando alguém perceber. Nenhum teste com banco falso mostra isso: o banco
 * falso não desfaz nada porque nunca fez nada.
 *
 *   HANDOFF_TEST_DB=postgresql://... npx vitest run ordemDeServico.integracao
 */

const URL_TESTE = process.env.HANDOFF_TEST_DB;
const rodar = URL_TESTE ? describe : describe.skip;

if (!URL_TESTE) {
  // eslint-disable-next-line no-console
  console.warn(
    "[ordemDeServico.integracao] pulado: HANDOFF_TEST_DB não definida. " +
      "O 'tudo ou nada' da abertura de OS NÃO foi verificado nesta execução.",
  );
}

rodar("abertura de ordem de serviço", () => {
  let prisma: PrismaClient;
  const marca = `os-${Date.now()}`;
  let departmentId = "";
  let cargoId = "";
  const criadas: string[] = [];

  beforeAll(async () => {
    const { PrismaClient: Cliente } = await import("@prisma/client");
    prisma = new Cliente({ datasources: { db: { url: URL_TESTE } } });

    const dep = await prisma.department.create({
      data: { numero: 911, slug: `${marca}-dep`, nome: "Depto de teste", missao: "teste" },
    });
    departmentId = dep.id;

    const cargo = await prisma.position.create({
      data: { slug: `${marca}-cargo`, titulo: "Cargo de teste", nivel: "GERENTE", departmentId },
    });
    cargoId = cargo.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.task.deleteMany({ where: { departmentId } });
    await prisma.project.deleteMany({ where: { departmentId } });
    await prisma.workOrder.deleteMany({ where: { departmentId } });
    await prisma.position.deleteMany({ where: { slug: { startsWith: marca } } });
    await prisma.department.deleteMany({ where: { slug: { startsWith: marca } } });
    await prisma.$disconnect();
  });

  const base = () => ({
    objetivo: "Abrir a sala",
    resultadoEsperado: "sala aberta",
    criterioDeAceite: "10 leads atendidos",
    departmentId,
    ownerPositionId: cargoId,
    prazo: new Date("2026-12-01"),
  });

  it("cria OS, projeto e tarefas, com número sequencial", async () => {
    const r = await abrirOrdemDeServico(prisma, {
      ...base(),
      projeto: { nome: "Sala de Vendas", objetivo: "ligar" },
      tarefas: [
        { titulo: "Configurar fila", assigneePositionId: cargoId },
        { titulo: "Escrever playbook", assigneePositionId: cargoId },
      ],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    criadas.push(r.ordem.workOrderId);

    expect(r.ordem.numero).toBeGreaterThan(0);
    expect(r.ordem.projectId).not.toBeNull();
    expect(r.ordem.taskIds).toHaveLength(2);

    const tarefas = await prisma.task.findMany({ where: { workOrderId: r.ordem.workOrderId } });
    expect(tarefas).toHaveLength(2);
    // O prazo da OS foi herdado: nenhuma tarefa ficou sem data.
    for (const t of tarefas) {
      expect(t.prazo).not.toBeNull();
      expect(t.assigneePositionId).toBe(cargoId);
    }
  });

  it("a linha do tempo registra a abertura inteira", async () => {
    const r = await abrirOrdemDeServico(prisma, {
      ...base(),
      projeto: { nome: "Outro", objetivo: "x" },
      tarefas: [{ titulo: "Uma", assigneePositionId: cargoId }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const eventos = await prisma.domainEvent.findMany({
      where: { entidadeId: { in: [r.ordem.workOrderId, r.ordem.projectId!, ...r.ordem.taskIds] } },
    });

    const tipos = eventos.map((e) => e.tipo).sort();
    expect(tipos).toEqual(["os.aberta", "projeto.aberto", "tarefa.criada"]);
  });

  it("se uma tarefa falhar, NADA é gravado — nem a OS, nem o número", async () => {
    // A tarefa 2 aponta para uma pessoa que não existe: a chave estrangeira
    // derruba a transação no meio. O que importa é o que sobra depois.
    const antes = await prisma.workOrder.count({ where: { departmentId } });

    await expect(
      abrirOrdemDeServico(prisma, {
        ...base(),
        objetivo: `${marca}-nao-deve-existir`,
        projeto: { nome: "Fantasma", objetivo: "x" },
        tarefas: [
          { titulo: "Boa", assigneePositionId: cargoId },
          { titulo: "Ruim", assigneeUserId: "pessoa-que-nao-existe" },
        ],
      }),
    ).rejects.toThrow();

    expect(await prisma.workOrder.count({ where: { departmentId } })).toBe(antes);
    expect(
      await prisma.workOrder.findFirst({ where: { objetivo: `${marca}-nao-deve-existir` } }),
    ).toBeNull();
    // E o projeto "Fantasma", criado ANTES da tarefa que falhou, também sumiu.
    expect(await prisma.project.findFirst({ where: { nome: "Fantasma" } })).toBeNull();
  });

  it("OS inválida é recusada antes de tocar no banco", async () => {
    const antes = await prisma.workOrder.count({ where: { departmentId } });

    const r = await abrirOrdemDeServico(prisma, { ...base(), criterioDeAceite: "" });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.recusas.map((x) => x.campo)).toContain("criterioDeAceite");
    expect(await prisma.workOrder.count({ where: { departmentId } })).toBe(antes);
  });
});
