/**
 * POST /api/admin/comercial/abordar-agora
 *
 * A porta para abordar UM lead específico com UM modelo específico — e, se ele
 * falhar, o próximo da ordem dada.
 *
 * ── POR QUE ELA EXISTE ──────────────────────────────────────────────────────
 * Três leads pagos receberam `foocci_contato_inicial_03` em 18/09/2026 e a Meta
 * recusou os três (`META_131042`). A recepção não os reaborda: para ela os três
 * já foram contatados. Sem esta porta não há como dizer "tenta de novo neste
 * lead, com este modelo".
 *
 * ── ⚠️ ELA ENVIA MENSAGEM A CLIENTE ─────────────────────────────────────────
 * POST, nunca GET: GET é o verbo do que não muda nada, e é o que um
 * pré-carregador de link dispara sozinho.
 *
 * ── AUTORIZAÇÃO ─────────────────────────────────────────────────────────────
 * `ABORDAR_AGORA_SECRET`, variável PRÓPRIA, tempo constante, fail-closed. Não
 * há encosto em nenhum outro segredo da casa — ver `abordarAgora/guarda.ts`.
 *
 * ── O QUE ELA NÃO AFROUXA ───────────────────────────────────────────────────
 * opt-out, telefone inválido, canal desligado, trava de repetição e variável
 * sem fonte continuam barrando — `ignorarJaContatado` perdoa exatamente dois
 * motivos do portão (`TETO_DE_TENTATIVAS`, `DESCANSO_ATIVO`) e nada mais.
 */

import { NextRequest, NextResponse } from "next/server";
import { escolherAgente } from "@/services/salaDeVendas/quemAtende";
import { prisma } from "@/lib/prisma";
import { CABECALHO_DO_SEGREDO, conferirSegredo } from "@/services/salaDeVendas/abordarAgora/guarda";
import { abordarAgora } from "@/services/salaDeVendas/abordarAgora/abordarAgora";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Quem responde pelas mensagens desta porta, quando o corpo não disser. */

function listaDeTextos(v: unknown): string[] | null {
  if (v == null) return [];
  if (!Array.isArray(v)) return null;
  if (!v.every((x) => typeof x === "string")) return null;
  return v as string[];
}

export async function POST(req: NextRequest) {
  const guarda = conferirSegredo({
    proprio: req.headers.get(CABECALHO_DO_SEGREDO),
    authorization: req.headers.get("authorization"),
  });
  if (!guarda.ok) {
    return NextResponse.json({ ok: false, error: guarda.motivo }, { status: guarda.status });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "corpo não é JSON" }, { status: 400 });
  }

  const leadIds = listaDeTextos(corpo.leadIds);
  const codigos = listaDeTextos(corpo.codigos);
  const modelos = listaDeTextos(corpo.modelos);
  if (!leadIds || !codigos || !modelos) {
    return NextResponse.json(
      { ok: false, error: "`leadIds`, `codigos` e `modelos`, quando presentes, são listas de texto" },
      { status: 400 },
    );
  }

  // ⚠️ Só o literal `true` liga o atalho. "true", "1" e "sim" NÃO ligam: passar
  // por cima de "este lead já recebeu mensagem" é ato explícito, e na dúvida a
  // resposta é não.
  const ignorarJaContatado = corpo.ignorarJaContatado === true;
  // ⚠️ MEDIDO EM PRODUÇÃO, 18/09/2026: o padrão era a string "abordar-agora",
  // que NÃO é um usuário do banco — e a gravação da mensagem morria em
  // `lead_mensagens_autorUserId_fkey`. O lead não era abordado, e o motivo que
  // chegava era "naoConseguiuGravar", que descreve o sintoma e esconde a causa.
  //
  // Toda mensagem que sai em nome da casa é assinada por alguém que EXISTE. Quem
  // responde essa pergunta já é `escolherAgente` — a mesma que a recepção usa.
  // Inventar um segundo jeito de assinar é como se cria a divergência.
  const pedido = typeof corpo.autorUserId === "string" ? corpo.autorUserId.trim() : "";
  const agente = pedido ? null : await escolherAgente(prisma);
  const autorUserId = pedido || agente?.userId || "";

  if (!autorUserId) {
    return NextResponse.json(
      {
        ok: false,
        erro:
          "não há agente comercial ativo para assinar a mensagem — " +
          "sem assinatura de alguém que existe, nada sai.",
      },
      { status: 409 },
    );
  }

  console.warn("[admin/comercial/abordar-agora] pedido", {
    em: new Date().toISOString(),
    leadIds: leadIds.length,
    codigos,
    modelos,
    ignorarJaContatado,
  });

  try {
    const r = await abordarAgora(prisma, { leadIds, codigos, modelos, ignorarJaContatado, autorUserId });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 });

    console.info("[admin/comercial/abordar-agora] resultado", {
      leads: r.leads.map((l) => ({ codigo: l.codigo, abordou: l.abordou, modeloQueSaiu: l.modeloQueSaiu })),
    });
    return NextResponse.json({ ok: true, data: r });
  } catch (e) {
    // ⚠️ A mensagem é recortada: ela pode carregar trecho de consulta, e
    // consulta carrega dado de terceiro.
    const detalhe = e instanceof Error ? e.message.slice(0, 200) : "erro desconhecido";
    console.error("[admin/comercial/abordar-agora] falhou", { detalhe });
    return NextResponse.json({ ok: false, error: detalhe }, { status: 500 });
  }
}
