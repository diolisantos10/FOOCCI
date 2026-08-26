/**
 * GET /api/admin/sala-de-vendas/time-de-agentes
 *
 * Quem é o time, e ele já está no sistema.
 *
 * ── ⚠️ ESTA ROTA NÃO TEM POST, E A AUSÊNCIA É A DECISÃO ─────────────────────
 *
 * Tinha. Era `POST { slug }`, e servia a um botão **"Pôr no sistema"**, um por
 * agente. O CEO leu a tela e corrigiu, em 26/08/2026: *"os agentes já são parte
 * do sistema. Eles não são externos, eles fazem parte do sistema. Os humanos é
 * que vão ter que fazer login e entrar no sistema"*.
 *
 * O botão era o resto de uma ideia errada que já tinha sido corrigida uma vez no
 * mesmo dia: primeiro dei **senha** ao agente, supondo que ele usa tela; tirei a
 * senha e mantive o botão — ou seja, continuei tratando-o como alguém que chega
 * de fora e precisa ser admitido.
 *
 * Agora o GET **garante** o time e o devolve. Abrir a tela é o bastante; não há
 * o que clicar, porque não há nada a decidir.
 *
 * ── O QUE CONTINUA VALENDO ──────────────────────────────────────────────────
 *
 * Nenhuma senha, em lugar nenhum. Este arquivo não importa `bcryptjs`, não
 * sorteia nada, e o papel `AGENTE_IA` é recusado por `autenticarInterno` mesmo
 * com hash gravado no banco. Tirar o POST não afrouxou nada — tirou uma porta.
 *
 * ── O QUE ESTA ROTA NÃO FAZ ─────────────────────────────────────────────────
 *
 * Não liga o agente para atender. Quem responde ao cliente é o TA, e o
 * interruptor dele continua sendo do dono (`interruptor.ts`). Existir no sistema
 * é ter identidade para assumir lead e assinar a trilha — não é estar na linha.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { lerSessaoInterna } from "@/lib/internal-auth";
import { TIME_DE_AGENTES } from "@/services/salaDeVendas/timeDeAgentes";
import { garantirTimeNoSistema } from "@/services/salaDeVendas/garantirTime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sessao = lerSessaoInterna();
  const eDono =
    isAdminAuthenticated() ||
    sessao?.role === "MASTER_CEO" ||
    sessao?.role === "DIRETOR_FOOCCI";

  if (!eDono) {
    return NextResponse.json({ ok: false, error: "Sem acesso." }, { status: 403 });
  }

  const r = await garantirTimeNoSistema(prisma);

  // A trilha registra só quando algo mudou. Registrar a leitura toda vez encheria
  // a auditoria de linhas que dizem "nada aconteceu", e a trilha existe para
  // que o que aconteceu seja fácil de achar.
  if (r.criados > 0) {
    try {
      await prisma.internalAuditEvent.create({
        data: {
          actorType: sessao ? "INTERNAL_USER" : "SYSTEM",
          actorLabel: sessao ? `${sessao.nome} (${sessao.userId})` : "porta do ADMIN_SECRET",
          acao: "time_de_agentes_materializado",
          recurso: "sala-de-vendas/time-de-agentes",
          resultado: "PERMITIDO",
          detalhe: { criados: r.criados, jaEstavam: r.jaEstavam },
        },
      });
    } catch {
      // Trilha fora do ar não impede a tela de abrir.
    }
  }

  return NextResponse.json({
    ok: true,
    data: {
      // A lista vem do código, não do banco: ela é a definição do time. O banco
      // guarda o registro de cada um, e é conferido acima.
      time: TIME_DE_AGENTES.map((a) => ({
        slug: a.slug,
        nome: a.nome,
        funcao: a.funcao,
      })),
      noSistema: r.jaEstavam + r.criados,
    },
  });
}
