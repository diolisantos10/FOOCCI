/**
 * GET   /api/admin/crm/contact-budget — lê o teto de contatos de UM restaurante
 * PATCH /api/admin/crm/contact-budget — ajusta o teto de contatos de UM restaurante
 *
 * A porta do administrador para o único número do CRM que é decisão de GASTO:
 * quantas pessoas diferentes o CRM pode abordar na vida toda
 * (`contactBudgetTotal`). Autorizada pelo CEO em 23/08/2026 — *"pode criar a
 * porta"* — porque ele não opera o produto por tela.
 *
 * ── O QUE ESTA ROTA NÃO FAZ, E É DE PROPÓSITO ───────────────────────────────
 *
 * Ela **não** toca em nenhuma regra anti-banimento — limite diário, intervalo
 * por cliente, horário de silêncio, delay entre envios, fim de semana. Aquelas
 * protegem o número de WhatsApp do lojista de ser bloqueado pela Meta, são
 * recalculadas no servidor a cada envio (`applyEffectiveSafety`) e mudá-las é
 * decisão do dono do produto, não extensão desta porta. A lista branca abaixo é
 * a trava disso: campo fora dela é **recusado com erro**, nunca ignorado em
 * silêncio — ignorar em silêncio faria a rota parecer que aceitou.
 *
 * Ela também **não** tem restaurante padrão. Sem identificador válido, recusa.
 * Uma porta administrativa que "escolhe sozinha" em quem mexer é uma porta que
 * um dia mexe em todos.
 *
 * ── ONDE MORA A REGRA ───────────────────────────────────────────────────────
 *
 * A validação do valor é a MESMA da tela do lojista, apontada e não copiada:
 * `parseContactBudgetTotal` em `@/lib/crm-contact-budget`. Se o produto recusa
 * pela tela, recusa aqui.
 *
 * ── ESCRITA CIRÚRGICA ───────────────────────────────────────────────────────
 *
 * A gravação é um merge sobre o JSON guardado, trocando UMA chave. Não
 * normaliza, não preenche padrão, não reescreve o resto: o que estava lá
 * continua exatamente como estava. É a diferença entre "mexi no teto" e "salvei
 * a configuração inteira e por acaso o resto continuou igual".
 *
 * SOMENTE o teto muda. Nenhuma mensagem é enviada por este caminho.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";
import { auditLog } from "@/lib/audit";
import { parseSafetyConfig, getConsumedContactCount } from "@/lib/crm-safety";
import { parseContactBudgetTotal } from "@/lib/crm-contact-budget";

/** Os ÚNICOS campos que esta rota aceita no corpo. Qualquer outro é erro. */
const CAMPOS_ACEITOS = new Set(["restaurantId", "slug", "contactBudgetTotal"]);

const ROUTE = "PATCH /api/admin/crm/contact-budget";

function guardaAdmin(req: NextRequest, rota: string): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { error: "Endpoint desabilitado — ADMIN_SECRET não configurado." },
      { status: 403 },
    );
  }
  if (!checkAdminRequest(req)) {
    auditLog({
      action: "crm.contact_budget_update_rejected",
      meta:   { route: rota, reason: "invalid_secret" },
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/** Resolve o restaurante por id OU slug. Nunca devolve um padrão. */
async function resolverRestaurante(
  restaurantId?: unknown,
  slug?: unknown,
): Promise<{ id: string; slug: string } | null> {
  if (typeof restaurantId === "string" && restaurantId.trim() !== "") {
    return prisma.restaurant.findUnique({
      where:  { id: restaurantId.trim() },
      select: { id: true, slug: true },
    });
  }
  if (typeof slug === "string" && slug.trim() !== "") {
    return prisma.restaurant.findUnique({
      where:  { slug: slug.trim() },
      select: { id: true, slug: true },
    });
  }
  return null;
}

async function saldo(restaurantId: string, teto: number) {
  const usados = await getConsumedContactCount(restaurantId);
  return {
    contactBudgetTotal: teto,
    pessoasJaAbordadas: usados,
    vagasRestantes:     teto > 0 ? Math.max(0, teto - usados) : null, // null = sem teto
    ligado:             teto > 0,
  };
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const rota = "GET /api/admin/crm/contact-budget";
  const negado = guardaAdmin(req, rota);
  if (negado) return negado;

  try {
    const sp = req.nextUrl.searchParams;
    const restaurante = await resolverRestaurante(sp.get("restaurantId"), sp.get("slug"));
    if (!restaurante) {
      return NextResponse.json(
        { error: "Informe restaurantId ou slug de um restaurante existente." },
        { status: 400 },
      );
    }

    const profile = await prisma.restaurantCRMProfile.findUnique({
      where:  { restaurantId: restaurante.id },
      select: { whatsAppSafetyConfig: true },
    });
    const teto = parseSafetyConfig(profile?.whatsAppSafetyConfig).contactBudgetTotal;

    return NextResponse.json({
      restaurantId: restaurante.id,
      slug:         restaurante.slug,
      ...(await saldo(restaurante.id, teto)),
    });
  } catch (err) {
    console.error(`[${rota}]`, err);
    return NextResponse.json({ error: "Falha ao ler o teto de contatos" }, { status: 500 });
  }
}

// ── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const negado = guardaAdmin(req, ROUTE);
  if (negado) return negado;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo não é JSON válido" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Corpo precisa ser um objeto JSON" }, { status: 400 });
  }
  const corpo = body as Record<string, unknown>;

  // ── Lista branca: campo de fora é RECUSADO, não ignorado ──────────────────
  // Ignorar em silêncio faria a rota responder 200 para quem tentou desligar o
  // horário de silêncio — e quem chamou iria embora achando que conseguiu.
  const intrusos = Object.keys(corpo).filter((k) => !CAMPOS_ACEITOS.has(k));
  if (intrusos.length > 0) {
    auditLog({
      action: "crm.contact_budget_update_rejected",
      meta:   { route: ROUTE, reason: "campo_nao_permitido", campos: intrusos.join(",") },
    });
    return NextResponse.json(
      {
        error:  "Esta rota só ajusta contactBudgetTotal.",
        campos_recusados: intrusos,
        detalhe: "As regras anti-banimento (limite diário, intervalo por cliente, horário de silêncio, delay, fim de semana) não passam por aqui — elas são recalculadas no servidor a cada envio.",
      },
      { status: 400 },
    );
  }

  if (!("contactBudgetTotal" in corpo)) {
    return NextResponse.json({ error: "Informe contactBudgetTotal" }, { status: 400 });
  }

  const valor = parseContactBudgetTotal(corpo.contactBudgetTotal);
  if (!valor.ok) {
    auditLog({
      action: "crm.contact_budget_update_rejected",
      meta:   { route: ROUTE, reason: "valor_invalido", detalhe: valor.error },
    });
    return NextResponse.json({ error: valor.error }, { status: 422 });
  }

  try {
    const restaurante = await resolverRestaurante(corpo.restaurantId, corpo.slug);
    if (!restaurante) {
      auditLog({
        action: "crm.contact_budget_update_rejected",
        meta:   { route: ROUTE, reason: "restaurante_nao_resolvido" },
      });
      return NextResponse.json(
        { error: "Informe restaurantId ou slug de um restaurante existente." },
        { status: 400 },
      );
    }

    const profile = await prisma.restaurantCRMProfile.findUnique({
      where:  { restaurantId: restaurante.id },
      select: { whatsAppSafetyConfig: true },
    });

    const guardado = (profile?.whatsAppSafetyConfig ?? {}) as Record<string, unknown>;
    const antes    = parseSafetyConfig(profile?.whatsAppSafetyConfig).contactBudgetTotal;
    // Merge cirúrgico: UMA chave muda, o resto do JSON fica byte a byte igual.
    const proximo  = { ...guardado, contactBudgetTotal: valor.value };

    await prisma.restaurantCRMProfile.upsert({
      where:  { restaurantId: restaurante.id },
      create: { restaurantId: restaurante.id, whatsAppSafetyConfig: proximo as object },
      update: { whatsAppSafetyConfig: proximo as object },
    });

    auditLog({
      action:       "crm.contact_budget_update",
      restaurantId: restaurante.id,
      targetId:     restaurante.slug,
      meta: {
        route: ROUTE,
        campo: "contactBudgetTotal",
        antes,
        depois: valor.value,
      },
    });

    const depois = await saldo(restaurante.id, valor.value);
    return NextResponse.json({
      restaurantId: restaurante.id,
      slug:         restaurante.slug,
      ...depois,
      // O antes/depois explícito: quem lê a resposta não precisa deduzir se
      // mudou alguma coisa nem comparar com o que tinha em mãos.
      alteracao: { campo: "contactBudgetTotal", antes, depois: valor.value },
    });
  } catch (err) {
    console.error(`[${ROUTE}]`, err);
    return NextResponse.json({ error: "Falha ao gravar o teto de contatos" }, { status: 500 });
  }
}
