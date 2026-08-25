/**
 * POST /api/admin/sala-de-vendas/primeiro-acesso
 *
 * Cria uma pessoa da Foocci sem terminal.
 *
 * ── POR QUE ISTO EXISTE, E POR QUE NÃO É UM ATALHO ──────────────────────────
 *
 * Sem uma pessoa cadastrada a Sala responde 401 para todo mundo — inclusive
 * para o CEO. E até hoje o único jeito de criar a primeira era
 * `npx tsx scripts/criar-usuario-interno.ts`, ou seja: acesso ao terminal do
 * ambiente de produção.
 *
 * A regra da casa é explícita sobre isso (`docs/kit/24-o-quadro-do-ceo.md`):
 * *"CEO não faz setup nenhum"*, e antes de pedir um passo humano o Diretor
 * esgota os caminhos. Este é o caminho: a mesma coisa que o script faz, atrás
 * da porta que o dono já tem na mão.
 *
 * ── QUEM PODE CHAMAR, E POR QUE NÃO É UMA PORTA NOVA ────────────────────────
 *
 * Só `ADMIN_SECRET` (a porta antiga) ou uma sessão de MASTER_CEO / Diretor.
 *
 * Quem tem o `ADMIN_SECRET` já abre a empresa inteira — inclusive o banco pelas
 * telas de administração. Esta rota **não concede nada que essa chave já não
 * conceda**; ela só troca "abrir um terminal em produção" por "preencher um
 * formulário". A superfície não cresce: o que muda é quem precisa saber usar
 * um terminal.
 *
 * O SDR NÃO pode: `AGENTE_HUMANO` criando gente seria escalada de privilégio
 * pela porta dos fundos — ele criaria um MASTER_CEO e viraria dono da casa.
 *
 * ── A SENHA APARECE UMA VEZ ─────────────────────────────────────────────────
 *
 * Sorteada aqui, devolvida uma vez, e nunca guardada em claro. Se a resposta se
 * perder, o jeito é criar de novo — e o mesmo e-mail troca a senha, com aviso.
 * Isto repete a lição do script: **se a senha é mostrada, ela é gravada.** As
 * duas coisas acontecem juntas ou não acontecem.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { lerSessaoInterna } from "@/lib/internal-auth";
import type { InternalRole } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Os papéis que esta rota cria.
 *
 * `AGENTE_IA` fica de fora de propósito: ator técnico não faz login, e
 * `autenticarInterno` recusa esse papel mesmo com hash gravado. Oferecê-lo aqui
 * criaria uma ficha que parece acesso e nunca entra.
 */
const PAPEIS: ReadonlySet<string> = new Set<InternalRole>([
  "MASTER_CEO",
  "DIRETOR_FOOCCI",
  "GERENTE_DEPARTAMENTO",
  "AGENTE_HUMANO",
  "AUDITOR_QA",
]);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface Corpo {
  nome?: unknown;
  email?: unknown;
  papel?: unknown;
  departamentos?: unknown;
}

export async function POST(req: NextRequest) {
  const sessao = lerSessaoInterna();
  const eDono =
    isAdminAuthenticated() ||
    sessao?.role === "MASTER_CEO" ||
    sessao?.role === "DIRETOR_FOOCCI";

  if (!eDono) {
    return NextResponse.json(
      { ok: false, error: "Só o dono da casa cria acesso." },
      { status: 403 },
    );
  }

  const corpo = (await req.json().catch(() => ({}))) as Corpo;
  const nome = typeof corpo.nome === "string" ? corpo.nome.trim() : "";
  const email = typeof corpo.email === "string" ? corpo.email.trim().toLowerCase() : "";
  const papel = typeof corpo.papel === "string" ? corpo.papel : "";
  const deps = Array.isArray(corpo.departamentos)
    ? corpo.departamentos.filter((d): d is string => typeof d === "string")
    : [];

  if (!nome) {
    return NextResponse.json({ ok: false, error: "Escreva o nome." }, { status: 400 });
  }
  if (!EMAIL.test(email)) {
    return NextResponse.json({ ok: false, error: "E-mail inválido." }, { status: 400 });
  }
  if (!PAPEIS.has(papel)) {
    return NextResponse.json(
      { ok: false, error: `Papel desconhecido: ${papel}` },
      { status: 400 },
    );
  }

  const senha = randomBytes(9).toString("base64url");
  const passwordHash = await hash(senha, 10);

  const jaExistia = await prisma.internalUser.findUnique({
    where: { email },
    select: { id: true },
  });

  const user = await prisma.internalUser.upsert({
    where: { email },
    // `passwordHash` no update também: sem ele, repetir o e-mail devolveria uma
    // senha nova que não funciona — foi o defeito que custou duas rodadas de
    // verificação no script.
    update: { nome, role: papel as InternalRole, isActive: true, passwordHash },
    create: { email, nome, role: papel as InternalRole, passwordHash },
  });

  for (const slug of deps) {
    const dep = await prisma.department.findUnique({ where: { slug }, select: { id: true } });
    if (!dep) continue; // departamento inexistente não derruba a criação da pessoa
    await prisma.departmentMembership.upsert({
      where: { internalUserId_departmentId: { internalUserId: user.id, departmentId: dep.id } },
      update: {},
      create: { internalUserId: user.id, departmentId: dep.id, isManager: false },
    });
  }

  await prisma.internalAuditEvent.create({
    data: {
      actorType: sessao ? "INTERNAL_USER" : "SYSTEM",
      actorLabel: sessao ? `${sessao.nome} (${sessao.userId})` : "porta do ADMIN_SECRET",
      acao: "criar_usuario_interno",
      recurso: `internal_users/${user.id}`,
      resultado: "PERMITIDO",
      detalhe: { email, papel, departamentos: deps, jaExistia: Boolean(jaExistia) },
    },
  });

  return NextResponse.json({
    ok: true,
    data: {
      nome,
      email,
      papel,
      senha,
      trocouSenha: Boolean(jaExistia),
      aviso: "Anote a senha: ela aparece uma vez e não fica guardada em lugar nenhum.",
    },
  });
}
