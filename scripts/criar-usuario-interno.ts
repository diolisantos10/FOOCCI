/**
 * Cria uma pessoa da Foocci, com senha.
 *
 *   npx tsx scripts/criar-usuario-interno.ts \
 *     --email dioli@foocci.com --nome "Dioli" --papel MASTER_CEO --cargo ceo
 *
 * Opcional: `--departamentos vendas,marketing` e `--gerencia vendas`.
 *
 * ── POR QUE A SENHA NÃO É ARGUMENTO ──
 *
 * Senha em linha de comando fica no histórico do shell e no `ps` de quem
 * estiver na mesma máquina. Este script SORTEIA a senha, imprime uma vez e não
 * guarda em lugar nenhum — quem criou anota e troca depois.
 *
 * O `--papel AGENTE_IA` é aceito e cria a ficha SEM senha, de propósito: ator
 * técnico não faz login, e `autenticarInterno` recusa esse papel mesmo que
 * alguém grave um hash nele mais tarde.
 */

import { PrismaClient, type InternalRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const PAPEIS: readonly InternalRole[] = [
  "MASTER_CEO",
  "DIRETOR_FOOCCI",
  "GERENTE_DEPARTAMENTO",
  "AGENTE_HUMANO",
  "AGENTE_IA",
  "AUDITOR_QA",
];

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const nome = arg("nome")?.trim();
  const papel = (arg("papel") ?? "AGENTE_HUMANO") as InternalRole;
  const cargoSlug = arg("cargo");
  const deps = (arg("departamentos") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const gerencia = (arg("gerencia") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  if (!email || !nome) {
    console.error("uso: --email <email> --nome <nome> [--papel PAPEL] [--cargo slug]");
    console.error(`papéis: ${PAPEIS.join(" ")}`);
    process.exit(2);
  }
  if (!PAPEIS.includes(papel)) {
    console.error(`Papel inválido: ${papel}. Use um de: ${PAPEIS.join(" ")}`);
    process.exit(2);
  }

  // Gerenciar sem pertencer não faz sentido — e deixar passar produziria uma
  // pessoa que administra um departamento onde ela não está.
  const orfaos = gerencia.filter((g) => !deps.includes(g));
  if (orfaos.length) {
    console.error(`Gerencia mas não pertence a: ${orfaos.join(", ")}. Inclua em --departamentos.`);
    process.exit(2);
  }

  const cargo = cargoSlug
    ? await prisma.position.findUnique({ where: { slug: cargoSlug } })
    : null;
  if (cargoSlug && !cargo) {
    console.error(`Cargo "${cargoSlug}" não existe. Rode o seed-organizacao primeiro.`);
    process.exit(2);
  }

  const senha = papel === "AGENTE_IA" ? null : randomBytes(9).toString("base64url");
  const passwordHash = senha ? await hash(senha, 10) : null;

  const user = await prisma.internalUser.upsert({
    where: { email },
    update: { nome, role: papel, positionId: cargo?.id ?? null, isActive: true },
    create: { email, nome, role: papel, passwordHash, positionId: cargo?.id ?? null },
  });

  for (const slug of deps) {
    const dep = await prisma.department.findUnique({ where: { slug } });
    if (!dep) {
      console.error(`Departamento "${slug}" não existe.`);
      process.exit(2);
    }
    await prisma.departmentMembership.upsert({
      where: { internalUserId_departmentId: { internalUserId: user.id, departmentId: dep.id } },
      update: { isManager: gerencia.includes(slug) },
      create: {
        internalUserId: user.id,
        departmentId: dep.id,
        positionId: cargo?.id ?? null,
        isManager: gerencia.includes(slug),
      },
    });
  }

  await prisma.internalAuditEvent.create({
    data: {
      actorType: "SYSTEM",
      actorLabel: "scripts/criar-usuario-interno",
      acao: "criar_usuario_interno",
      recurso: `internal_users/${user.id}`,
      resultado: "PERMITIDO",
      detalhe: { email, papel, cargo: cargoSlug ?? null, departamentos: deps },
    },
  });

  console.log(`\n✓ ${nome} · ${email} · papel ${papel}`);
  if (cargo) console.log(`  cargo: ${cargo.titulo}`);
  if (deps.length) console.log(`  departamentos: ${deps.join(", ")}`);
  if (gerencia.length) console.log(`  gerencia: ${gerencia.join(", ")}`);

  if (senha) {
    console.log(`\n  SENHA (aparece uma vez só): ${senha}\n`);
  } else {
    console.log("\n  Sem senha — AGENTE_IA não faz login interativo.\n");
  }
}

main()
  .catch((e) => {
    console.error("Falhou:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
