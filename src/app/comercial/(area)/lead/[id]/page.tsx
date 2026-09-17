/**
 * Comercial → CRM 360 do lead (tela 04 do desenho do CEO).
 *
 * ── A FECHADURA É DESTA PORTA, NÃO DA MOLDURA ───────────────────────────────
 *
 * Esta página recebe um id na URL. É exatamente o caso que
 * `_guarda.podeVerOLead` existe para cobrir do lado das rotas de API: sem a
 * checagem, `/comercial/lead/<qualquer>` devolveria a ficha de qualquer
 * prospecto a qualquer pessoa com login. A regra aqui é a MESMA daquela função,
 * e deliberadamente repetida em vez de importada: aquele arquivo devolve
 * `NextResponse`, que é linguagem de rota, não de página.
 *
 * O SDR alcança o que é dele, o que não é de ninguém e o que está esperando
 * gente. Quem enxerga a operação inteira alcança tudo.
 *
 * ⚠️ **404 e não 403**, pelo mesmo motivo da guarda das rotas: um 403
 * confirmaria que o lead existe, e num sistema comercial isso já é informação —
 * dá para varrer ids e medir o tamanho da base sem ler um dado sequer. Aqui isso
 * vira a mesma tela de "não encontrado" para os dois casos.
 *
 * ⛔ Somente leitura. Esta página não envia mensagem, não move estágio e não
 * cria proposta.
 */

import { lerSessaoInterna } from "@/lib/internal-auth";
import { prisma } from "@/lib/prisma";
import { lerFichaDoLead, leadAoAlcance } from "@/services/salaDeVendas/crm360";
import { Crm360View, FichaNaoEncontrada, FichaComErro } from "./Crm360View";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ficha do lead · Comercial" };

export default async function FichaDoLeadPage({ params }: { params: { id: string } }) {
  const sessao = lerSessaoInterna();
  if (!sessao) {
    return <p className="p-6 text-[13px] text-muted">Entre para ver a ficha do lead.</p>;
  }

  try {
    if (!(await leadAoAlcance(prisma, sessao, params.id))) return <FichaNaoEncontrada />;

    const r = await lerFichaDoLead(prisma, { leadId: params.id });
    if (!r.achou) return <FichaNaoEncontrada />;

    return <Crm360View f={r.ficha} />;
  } catch (e) {
    return <FichaComErro detalhe={e instanceof Error ? e.message : null} />;
  }
}
