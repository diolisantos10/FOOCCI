/**
 * FoocciSalesMedia — baixar o arquivo que o cliente mandou para o número de VENDAS.
 *
 * ── POR QUE NÃO REUSEI `whatsapp/metaMedia.ts` ───────────────────────────────
 * Existe sim um caminho pronto na casa — `downloadMetaMedia` — e ele é o certo
 * para o WhatsApp dos RESTAURANTES: ele resolve a credencial por
 * `restaurantId`, via `MetaConfigService`. O número de vendas da Foocci não tem
 * restaurante (é o terceiro número sem dono, ver `FoocciSalesChannel`), então
 * não há `restaurantId` para passar. O que se reusa aqui é o que de fato é
 * comum: os dois passos da Graph e a regra de que o token não sai do servidor.
 *
 * ── OS DOIS PASSOS DA META ───────────────────────────────────────────────────
 *   1. GET /{media-id}          → { url, mime_type }   (url temporária)
 *   2. GET {url} com Bearer     → os bytes
 *
 * 🔒 A url do passo 1 é temporária E autenticada: ela **não serve** para mandar
 * ao navegador. Sem o header ela responde 401; com o header ela vazaria o
 * token na rede do cliente. Por isso os bytes são buscados aqui e entregues
 * pela rota autenticada — o token nunca atravessa a fronteira do servidor.
 * O empréstimo do token é `comOTokenDeVendas`, que recebe o resultado da
 * consulta e nunca devolve a credencial.
 */

import { metaGraphUrl } from "@/services/whatsapp/metaFlag";
import { comOTokenDeVendas } from "./FoocciSalesChannel";

export type MidiaDeVendas =
  | { ok: true; bytes: Buffer; mimeType: string | null }
  /**
   * `canalDesligado` é separado de `falhou` de propósito: sem token o canal
   * simplesmente não existe neste ambiente, e isso é um 501 honesto — não um
   * erro intermitente que alguém vai tentar de novo achando que passa.
   */
  | { ok: false; causa: "canalDesligado" }
  | { ok: false; causa: "falhou"; detalhe: string };

export async function baixarMidiaDeVendas(midiaId: string): Promise<MidiaDeVendas> {
  const id = (midiaId ?? "").trim();
  if (!id) return { ok: false, causa: "falhou", detalhe: "media id vazio" };

  return comOTokenDeVendas<MidiaDeVendas>(
    async (token) => {
      try {
        const cabecalho = { Authorization: `Bearer ${token}` };

        const meta = await fetch(metaGraphUrl(id), { headers: cabecalho });
        if (!meta.ok) return { ok: false, causa: "falhou", detalhe: `consulta ${meta.status}` };
        const info = (await meta.json().catch(() => ({}))) as { url?: string; mime_type?: string };
        if (!info.url) return { ok: false, causa: "falhou", detalhe: "a Meta não devolveu url" };

        const bin = await fetch(info.url, { headers: cabecalho });
        if (!bin.ok) return { ok: false, causa: "falhou", detalhe: `download ${bin.status}` };

        return {
          ok: true,
          bytes: Buffer.from(await bin.arrayBuffer()),
          mimeType: info.mime_type ?? bin.headers.get("content-type"),
        };
      } catch (e) {
        return { ok: false, causa: "falhou", detalhe: e instanceof Error ? e.message.slice(0, 200) : "erro desconhecido" };
      }
    },
    () => ({ ok: false, causa: "canalDesligado" }),
  );
}
