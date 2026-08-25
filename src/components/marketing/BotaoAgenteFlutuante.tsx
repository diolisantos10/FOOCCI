"use client";

/**
 * O botãozinho de WhatsApp no canto da tela — pedido do CEO (24/08/2026):
 * *"no canto da tela, um botãozinho do WhatsApp sinalizando 'tire suas dúvidas'
 * ou 'fale com o nosso agente'."*
 *
 * ── Três decisões que valem explicação ──────────────────────────────────────
 *
 * 1. **Só aparece quando o canal está NO AR.** Quem decide é o layout, no
 *    servidor. Botão verde de WhatsApp apontando para número que não atende é
 *    pior que botão nenhum: a pessoa manda mensagem, ninguém responde, e ela
 *    conclui que a empresa está morta. Enquanto o número não estiver verificado,
 *    o site continua com a porta que funciona (o formulário).
 *
 * 2. **No celular ele sobe, não some.** Ele nasceu só no desktop porque a barra
 *    fixa de baixo era o convite comercial do celular. Desde 24/08/2026 aquela
 *    barra virou "Assinar" (ordem do CEO), então a dúvida ficaria sem porta no
 *    celular — que é onde quase todo dono de restaurante abre o site. Agora ele
 *    aparece em toda tela, e no celular fica ACIMA da barra, sem tapá-la.
 *
 * 3. **Não abre conversa sozinho.** É um link: quem escreve primeiro é sempre o
 *    visitante. O envio automático do SDR continua desligado por outra chave, e
 *    nada aqui o liga.
 */

import { AGENTE_FLUTUANTE_LABEL, AGENTE_URL } from "./config";

/** O ícone oficial do WhatsApp, desenhado inline — nenhuma requisição a terceiro. */
function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="currentColor">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.48-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.470 0 1.46 1.06 2.87 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35Z" />
      <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.48 1.34 5L2 22l5.16-1.35a9.9 9.9 0 0 0 4.88 1.27h.01c5.49 0 9.95-4.46 9.95-9.96C22 6.46 17.54 2 12.04 2Zm0 18.13h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.11.81.83-3.03-.2-.31a8.16 8.16 0 0 1-1.25-4.36c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.83 2.41a8.19 8.19 0 0 1 2.4 5.83c0 4.54-3.69 8.21-8.24 8.21Z" />
    </svg>
  );
}

export function BotaoAgenteFlutuante() {
  return (
    <a
      href={AGENTE_URL}
      target="_blank"
      rel="noopener noreferrer"
      // `group` para o rótulo crescer no hover: parado ele é só o ícone (não tapa
      // conteúdo), e ao passar o mouse ele se explica.
      className="group fixed bottom-24 right-5 z-40 inline-flex items-center gap-0 rounded-full bg-[#25D366] py-3 pl-3 pr-3 text-white shadow-lg transition-all hover:gap-2 hover:pr-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 lg:bottom-6 lg:right-6"
    >
      <WhatsAppGlyph />
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-all group-hover:max-w-[12rem] group-hover:opacity-100">
        {AGENTE_FLUTUANTE_LABEL}
      </span>
      {/* O nome acessível não depende do hover: leitor de tela nunca passa o mouse. */}
      <span className="sr-only">{AGENTE_FLUTUANTE_LABEL} no WhatsApp</span>
    </a>
  );
}
