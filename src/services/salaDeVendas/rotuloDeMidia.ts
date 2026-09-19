/**
 * rotuloDeMidia — o rótulo do que chegou, em UM lugar só.
 *
 * ⚠️ Este arquivo existe para não ter DOIS rótulos. A tela (componente de
 * cliente) e o serviço (que roda no servidor, com Prisma) precisam da mesma
 * frase; se cada um escrevesse a sua, elas divergiriam no primeiro conserto e a
 * lista de conversas passaria a dizer uma coisa e a bolha, outra.
 *
 * Por isso aqui dentro **não se importa Prisma, nem banco, nem nada de
 * servidor**: é função pura sobre string, e é o que permite que o bundle do
 * navegador a carregue sem arrastar o cliente do banco junto.
 */

/**
 * O que chegou e NÃO cabe na tela — dizendo **o que é** e **por que não aparece**.
 *
 * "📦 Conteúdo não suportado" era a resposta antiga, e ela não informa ninguém:
 * nem o vendedor (que não sabe se perdeu um cardápio ou uma figurinha), nem
 * quem vai consertar (que não sabe o que implementar). O tipo cru está guardado
 * desde a recepção justamente para este momento.
 */
export function rotuloDoNaoSuportado(tipoCru?: string | null): string {
  switch ((tipoCru ?? "").toLowerCase()) {
    case "location": return "📍 Localização enviada pelo cliente — o mapa ainda não abre aqui";
    case "contacts": return "👤 Contato compartilhado — a ficha ainda não abre aqui";
    case "sticker":  return "🙂 Figurinha";
    case "reaction": return "💬 Reação a uma mensagem";
    case "button":
    case "interactive": return "🔘 Resposta a um botão";
    case "unknown":
    case "unsupported": return "📦 A Meta avisou que chegou algo que ela mesma não entregou";
    case "": return "📦 Chegou algo sem tipo declarado pela Meta — nada a mostrar";
    default: return `📦 ${tipoCru} — chegou e está guardado, mas esta tela ainda não sabe mostrar`;
  }
}

/**
 * O rótulo de uma mídia que existe mas cujos BYTES não vieram.
 *
 * Nunca "não suportado": o arquivo é suportado, o download é que falhou — e
 * quem lê precisa saber que dá para tentar de novo.
 */
export function rotuloDeMidiaQueNaoAbriu(tipo: string, midiaNome?: string | null): string {
  switch (tipo) {
    case "IMAGEM": return "🖼️ Imagem do cliente — não consegui baixar da Meta agora";
    case "AUDIO": return "🎤 Áudio do cliente — não consegui baixar da Meta agora";
    case "VIDEO": return "🎬 Vídeo do cliente — não consegui baixar da Meta agora";
    case "DOCUMENTO": return `📎 ${midiaNome ?? "Arquivo"} — não consegui baixar da Meta agora`;
    default: return "📦 Arquivo do cliente — não consegui baixar da Meta agora";
  }
}
