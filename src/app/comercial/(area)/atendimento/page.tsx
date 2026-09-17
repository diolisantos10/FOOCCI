/**
 * Comercial → Central de atendimento (tela 03 do desenho do CEO).
 *
 * ── POR QUE É SERVIDOR, SEM ROTA NOVA E SEM `fetch` ─────────────────────────
 *
 * Esta tela lê — e só lê — números agregados que os serviços da Sala já
 * calculam. Criar `/api/admin/sala-de-vendas/central` para servir isso a um
 * componente de cliente seria uma porta a mais para guardar, com a mesma
 * consulta atrás dela. O precedente é `precos/page.tsx`, pelo mesmo motivo.
 *
 * ⚠️ E vale o contrário do que a moldura sugere: o layout de `/comercial` exige
 * sessão, mas **não** decide papel. A fechadura desta porta está aqui embaixo, e
 * é a mesma lista de papéis do painel do gerente — carga por atendente é
 * informação de comando, não de fila.
 *
 * ⛔ Esta página NÃO envia nada. Não há aqui um caminho de WhatsApp, novo ou
 * reaproveitado: todo link leva para a conversa que já existe.
 */

import { lerSessaoInterna } from "@/lib/internal-auth";
import { prisma } from "@/lib/prisma";
import { montarCentralDeAtendimento } from "@/services/salaDeVendas/centralDeAtendimento";
import { CentralDeAtendimentoView, CentralComErro } from "./CentralDeAtendimentoView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Central de atendimento · Comercial" };

/** Quem enxerga a operação inteira. Espelha `PAPEIS_DO_PAINEL` e `vePelaOperacaoToda`. */
const PAPEIS_DA_CENTRAL = new Set<string>([
  "MASTER_CEO",
  "DIRETOR_FOOCCI",
  "GERENTE_DEPARTAMENTO",
  "AUDITOR_QA",
]);

export default async function CentralDeAtendimentoPage() {
  const sessao = lerSessaoInterna();

  // O layout já barrou quem não tem sessão. Este `if` existe para o caso de a
  // página ser alcançada fora dela um dia — porta que depende da moldura é porta
  // destrancada.
  if (!sessao) {
    return (
      <p className="p-6 text-[13px] text-muted">Entre para ver a central de atendimento.</p>
    );
  }

  if (!PAPEIS_DA_CENTRAL.has(sessao.role)) {
    return (
      <div className="p-6">
        <p className="text-[13px] font-semibold text-ink">Esta tela não é do seu perfil.</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink2">
          A central mostra a carga de todos os atendentes. Sua fila de trabalho
          está em <span className="font-semibold">Conversas</span>.
        </p>
      </div>
    );
  }

  try {
    const central = await montarCentralDeAtendimento(prisma, new Date());
    return <CentralDeAtendimentoView c={central} />;
  } catch (e) {
    // A falha é mostrada COMO falha. Um `catch` que devolvesse a tela com zeros
    // transformaria banco fora do ar em "dia tranquilo".
    return <CentralComErro detalhe={e instanceof Error ? e.message : null} />;
  }
}
