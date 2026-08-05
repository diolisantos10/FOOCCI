/**
 * GET /api/admin/billing/gateway — a chave de cobrança está viva?
 * Auth: x-admin-secret header OU cookie de admin (padrão da casa).
 *
 * A PERGUNTA QUE ESTA ROTA RESPONDE, e por que ela precisou existir:
 * até aqui, a única coisa que o sistema sabia dizer sobre o Mercado Pago era
 * "a variável está definida" (`mpConfigured`). Isso não é a mesma pergunta.
 * Token errado, vencido ou rotacionado deixa `mpConfigured` em `true` e o
 * checkout continua parecendo saudável — até um cliente de verdade contratar e
 * chegar na tela sem link de pagamento. É a pior classe de falha que existe
 * aqui: silenciosa e do lado do dinheiro.
 *
 * O diagnóstico é LEITURA PURA (`GET /users/me` no MP). Não cria assinatura,
 * não gera cobrança, não deixa rastro na conta — de propósito. A alternativa
 * era fazer uma contratação de mentira em produção para descobrir se a chave
 * funciona, o que suja a carteira e cria recorrência de verdade no gateway.
 *
 * O que sai daqui: veredito, identificação da conta (para conferir que é a
 * conta CERTA — chave válida da empresa errada é um erro real) e, na falha, a
 * razão que o Mercado Pago deu. Nunca o token, nem pedaço dele.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { MercadoPagoPlatformBilling } from "@/services/billing/MercadoPagoPlatformBilling";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ ok: false }, { status: 401 });

  const resultado = await MercadoPagoPlatformBilling.checkCredential();

  if (!resultado.ok) {
    // HTTP 200 de propósito: a ROTA funcionou, quem está fora do ar é o gateway.
    // Devolver 5xx aqui faria a tela do admin mostrar "erro ao consultar" em vez
    // do diagnóstico — e o diagnóstico é justamente o produto desta rota.
    return NextResponse.json({
      ok: true,
      gateway: {
        vivo: false,
        motivo: resultado.reason,
        recado: "O cliente que contratar agora NÃO recebe link de pagamento. Revise a variável MP_PLATFORM_ACCESS_TOKEN no Railway.",
      },
    });
  }

  return NextResponse.json({
    ok: true,
    gateway: {
      vivo: true,
      conta: {
        id: resultado.accountId,
        apelido: resultado.nickname,
        pais: resultado.siteId,
      },
      recado: "A chave responde e o checkout consegue emitir link de pagamento.",
    },
  });
}
