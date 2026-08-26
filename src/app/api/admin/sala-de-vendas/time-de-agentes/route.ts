/**
 * O TIME DE AGENTES — pôr um agente no sistema. Sem senha, e sem como ganhar uma.
 *
 * ── POR QUE ESTA ROTA EXISTE, SE JÁ HÁ `primeiro-acesso` ────────────────────
 *
 * Porque `primeiro-acesso` faz uma coisa que aqui seria defeito: **sorteia uma
 * senha e a devolve na resposta**. Ela existe para GENTE, que precisa digitar
 * algo depois.
 *
 * Agente não digita nada. O CEO foi direto em 26/08/2026: *"os agentes de IA,
 * eles não têm login, eles estão lá no sistema"*. Uma senha aqui seria uma
 * credencial que ninguém usa — e credencial que ninguém usa é credencial que
 * qualquer um pode usar, porque ninguém sente falta quando ela roda.
 *
 * Reaproveitar a outra rota com um `if` seria pior que duplicar: bastaria
 * alguém inverter a condição um dia para o agente voltar a ter senha, e nada
 * na tela mostraria isso. Rota separada torna o "sem senha" estrutural — este
 * arquivo não tem `randomBytes`, não tem `hash`, e não tem o que vazar.
 *
 * ── AS DUAS TRAVAS ──────────────────────────────────────────────────────────
 *
 * 1. **`passwordHash` nunca é escrito.** Fica `null`, e `autenticarInterno`
 *    recusa quem não tem hash.
 * 2. **O papel é `AGENTE_IA`, fixo neste arquivo** — não vem do corpo do
 *    pedido. `autenticarInterno` recusa esse papel *mesmo com hash gravado*.
 *
 * Duas travas para a mesma coisa é de propósito: a primeira cai sozinha no dia
 * em que alguém rodar um script de "resetar senha de todo mundo" em cima da
 * tabela. A segunda continua de pé nesse dia.
 *
 * ── O QUE ESTA ROTA NÃO FAZ ─────────────────────────────────────────────────
 *
 * Não liga o agente para atender. Quem responde ao cliente é o TA, e o
 * interruptor dele continua sendo do dono (`interruptor.ts`). Pôr o agente no
 * sistema é dar-lhe identidade para assumir lead e assinar a trilha — não é
 * soltá-lo na linha.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { lerSessaoInterna } from "@/lib/internal-auth";
import {
  agentePorSlug,
  PAPEL_DO_TIME,
  DEPARTAMENTOS_DO_TIME,
} from "@/services/salaDeVendas/timeDeAgentes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Corpo {
  slug?: unknown;
}

export async function POST(req: NextRequest) {
  const sessao = lerSessaoInterna();
  const eDono =
    isAdminAuthenticated() ||
    sessao?.role === "MASTER_CEO" ||
    sessao?.role === "DIRETOR_FOOCCI";

  if (!eDono) {
    return NextResponse.json(
      { ok: false, error: "Só o dono da casa põe agente no sistema." },
      { status: 403 },
    );
  }

  const corpo = (await req.json().catch(() => ({}))) as Corpo;
  const slug = typeof corpo.slug === "string" ? corpo.slug : "";

  // ⚠️ O nome e o e-mail vêm da LISTA, nunca do pedido. Aceitá-los do corpo
  // deixaria qualquer chamada inventar um agente com o e-mail de uma pessoa de
  // verdade — e o `upsert` abaixo cairia em cima do registro dela.
  const agente = agentePorSlug(slug);
  if (!agente) {
    return NextResponse.json(
      { ok: false, error: `Agente desconhecido: ${slug || "(vazio)"}` },
      { status: 400 },
    );
  }

  const jaExistia = await prisma.internalUser.findUnique({
    where: { email: agente.email },
    select: { id: true },
  });

  const user = await prisma.internalUser.upsert({
    where: { email: agente.email },
    // O update NÃO toca em `passwordHash`. Se um dia alguém gravar um hash aqui
    // por fora, clicar de novo no botão não o apaga — mas o papel `AGENTE_IA`
    // continua barrando o login. É a segunda trava fazendo o trabalho dela.
    update: { nome: agente.nome, role: PAPEL_DO_TIME, isActive: true },
    create: { email: agente.email, nome: agente.nome, role: PAPEL_DO_TIME },
  });

  for (const slugDep of DEPARTAMENTOS_DO_TIME) {
    const dep = await prisma.department.findUnique({
      where: { slug: slugDep },
      select: { id: true },
    });
    if (!dep) continue; // departamento inexistente não derruba a entrada do agente
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
      acao: "por_agente_no_sistema",
      recurso: `internal_users/${user.id}`,
      resultado: "PERMITIDO",
      detalhe: { slug: agente.slug, email: agente.email, jaExistia: Boolean(jaExistia) },
    },
  });

  return NextResponse.json({
    ok: true,
    data: {
      slug: agente.slug,
      nome: agente.nome,
      // Sem `senha` e sem `trocouSenha`: não há o que anotar. A tela lê a
      // ausência destes campos como "está no sistema" — e é a verdade.
      jaEstava: Boolean(jaExistia),
    },
  });
}

/**
 * GET — quem do time já está no sistema.
 *
 * A tela precisa disto para não oferecer "pôr no sistema" a quem já está. Sem
 * esta leitura, o botão seria um interruptor sem lâmpada: clicar de novo não
 * quebra nada (o upsert é idempotente), mas quem clica não tem como saber se
 * precisava.
 */
export async function GET() {
  const sessao = lerSessaoInterna();
  const eDono =
    isAdminAuthenticated() ||
    sessao?.role === "MASTER_CEO" ||
    sessao?.role === "DIRETOR_FOOCCI";

  if (!eDono) {
    return NextResponse.json({ ok: false, error: "Sem acesso." }, { status: 403 });
  }

  const dentro = await prisma.internalUser.findMany({
    where: { role: PAPEL_DO_TIME, isActive: true },
    select: { email: true },
  });

  return NextResponse.json({
    ok: true,
    data: { emails: dentro.map((u) => u.email) },
  });
}
