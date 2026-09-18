/**
 * ⛔ O PORTEIRO DE CHAVE DO CATÁLOGO DE MODELOS.
 *
 * Mora em serviço, e não na rota, por duas razões: o `route.ts` do App Router
 * só pode exportar handlers (qualquer outro export vira erro de build), e o
 * porteiro precisa ser testável sem subir rota.
 *
 * `FOOCCI_WHATSAPP_TEMPLATES_KEY` é exclusiva desta porta — ver o cabeçalho da
 * rota para o porquê de não reusar nenhuma chave existente.
 */

import { NextResponse } from "next/server";

export const CABECALHO_DA_CHAVE = "x-foocci-templates-key";
export const NOME_DA_CHAVE = "FOOCCI_WHATSAPP_TEMPLATES_KEY";

/** Devolve a resposta de recusa, ou `null` quando pode passar. */
export function conferirChaveDoCatalogo(req: { headers: { get(n: string): string | null } }): NextResponse | null {
  const esperado = process.env[NOME_DA_CHAVE]?.trim();
  // ⛔ Fail-closed: ausência de configuração nunca é permissão.
  if (!esperado) {
    console.error(`[whatsapp/catalogo-de-modelos] ${NOME_DA_CHAVE} não configurada`);
    return NextResponse.json({ ok: false, error: `Comando desligado — ${NOME_DA_CHAVE} não configurada.` }, { status: 503 });
  }
  const recebido = req.headers.get(CABECALHO_DA_CHAVE);
  // Tamanho antes do conteúdo: não vaza o comprimento por tempo. O resto é
  // comparação simples porque a chave é longa e aleatória.
  if (!recebido || recebido.length !== esperado.length || recebido !== esperado) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }
  return null;
}
