/**
 * GET /api/admin/sala-de-vendas/conversa/midia/[mensagemId]
 *
 * Os bytes do arquivo que o CLIENTE mandou, para a tela de Conversas.
 *
 * ── AS TRÊS CAMADAS, IGUAIS ÀS DA CONVERSA ──────────────────────────────────
 *   1. `guardarSalaDeVendas` — você é da Sala? (protege o endereço)
 *   2. `podeVerOLead`        — este lead é alcançável por você? (protege o dado)
 *   3. só então os bytes
 *
 * A camada 2 é a que costuma faltar em rota de anexo, e é justamente a que
 * importa: sem ela, quem tivesse um id de mensagem leria a conversa alheia —
 * e id de mensagem circula em log, em print e na URL do navegador. É por isso
 * que o pedido é pelo id da MENSAGEM e não pelo media id da Meta: o media id
 * não diz de quem é a conversa, e um parâmetro que não se pode conferir não se
 * aceita.
 *
 * 🔒 A url temporária da Meta NUNCA sai daqui, e o token menos ainda. O
 * navegador pede a esta rota e recebe bytes — nada mais.
 *
 * ⚠️ SÓ ENTRADA. Anexo de SAÍDA não passa por aqui porque o Foocci ainda não
 * envia mídia; servir saída seria prometer um caminho que não existe.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas, podeVerOLead } from "../../../_guarda";
import { comSessao } from "@/services/salaDeVendas/identidadeNoBanco";
import { baixarMidiaDeVendas } from "@/services/foocci-sdr/FoocciSalesMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { mensagemId: string } },
) {
  const portao = await guardarSalaDeVendas(req, "ver_midia_da_conversa");
  if (!portao.ok) return portao.resposta;

  // `lead_mensagens` está sob RLS: fora de `comSessao` a consulta volta vazia e
  // um anexo legítimo viraria 404 para o próprio dono.
  const mensagem = await comSessao(prisma, portao.sessao, (tx) =>
    tx.leadMensagem.findUnique({
      where: { id: params.mensagemId },
      select: { leadId: true, direcao: true, midiaId: true, midiaMimeType: true, midiaNome: true },
    }),
  );

  if (!mensagem || mensagem.direcao !== "ENTRADA" || !mensagem.midiaId) {
    return new NextResponse(null, { status: 404 });
  }

  const acesso = await podeVerOLead(portao.sessao, mensagem.leadId, "ver_midia_da_conversa");
  if (!acesso.ok) return acesso.resposta;

  const r = await baixarMidiaDeVendas(mensagem.midiaId);

  if (!r.ok) {
    // Desligado e quebrado não são a mesma coisa, e a tela precisa saber a
    // diferença: num caso não adianta tentar de novo, no outro adianta.
    const status = r.causa === "canalDesligado" ? 501 : 502;
    return NextResponse.json(
      { ok: false, error: r.causa === "canalDesligado" ? "O canal de vendas não está configurado neste ambiente." : "A Meta não entregou o arquivo." },
      { status },
    );
  }

  const cabecalhos: Record<string, string> = {
    "Content-Type": r.mimeType || mensagem.midiaMimeType || "application/octet-stream",
    // `private` porque isto é dado de um lead: cache compartilhado serviria o
    // arquivo de uma conversa para quem pedisse a próxima.
    "Cache-Control": "private, max-age=3600",
  };
  if (mensagem.midiaNome) {
    cabecalhos["Content-Disposition"] = `inline; filename="${mensagem.midiaNome.replace(/"/g, "")}"`;
  }

  return new NextResponse(new Uint8Array(r.bytes), { status: 200, headers: cabecalhos });
}
