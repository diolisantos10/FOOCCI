/**
 * O ENDEREÇO ANTIGO DA SALA — e por que ele continua existindo.
 *
 * Em 26/08/2026 a Sala saiu de `/admin/sala-de-vendas` para `/atendimento`. Este
 * arquivo é o que faz o endereço velho continuar chegando ao lugar certo.
 *
 * ── POR QUE NÃO SIMPLESMENTE APAGAR ─────────────────────────────────────────
 *
 * Porque um endereço não vive só no menu. Ele está no favorito de quem trabalha
 * aqui, no link colado numa conversa, na anotação de alguém que anotou o caminho
 * para não esquecer. Apagar o endereço não apaga essas cópias — só transforma
 * cada uma delas num 404, e quem clicar vai concluir que o sistema quebrou.
 *
 * `[[...resto]]` é opcional de propósito: pega a raiz e todos os filhos de uma
 * vez, incluindo os dois que mudaram de nome (`atendimento` → `conversas`,
 * `canal` → `whatsapp`). A tradução mora em `lib/sala/rotas.ts`, com o resto dos
 * endereços — aqui não se digita caminho nenhum.
 *
 * Redireciono permanente: é uma mudança de endereço definitiva, e dizer isso ao
 * navegador evita que ele bata aqui de novo a cada clique no favorito antigo.
 */

import { permanentRedirect } from "next/navigation";
import { BASE_ANTIGA, destinoDoEnderecoAntigo } from "@/lib/sala/rotas";

export const dynamic = "force-dynamic";

export default async function SalaDeVendasMudouDeEndereco({
  params,
}: {
  params: Promise<{ resto?: string[] }>;
}) {
  const { resto } = await params;
  permanentRedirect(destinoDoEnderecoAntigo([BASE_ANTIGA, ...(resto ?? [])].join("/")));
}
