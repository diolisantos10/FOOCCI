/**
 * canalDeVendas — o WhatsApp de vendas do Foocci, resolvido EM TEMPO DE EXECUÇÃO.
 *
 * ── A armadilha que este arquivo existe para matar ──────────────────────────
 * O site já lia o número por `NEXT_PUBLIC_WHATSAPP_SALES_NUMBER`, e variável
 * `NEXT_PUBLIC_*` é **congelada no build**: salvar no Railway sem refazer o build
 * não muda nada — sem erro, sem log, sem sintoma. Quem salva olha o site, não vê
 * o botão e conclui que está quebrado.
 *
 * Aqui a dependência acaba de dois jeitos:
 *
 *  1. **O número mora no repositório** (`NUMERO_DE_VENDAS`). Ele não é segredo —
 *     é o número que vai estampado num botão para o mundo inteiro clicar. Sendo
 *     constante de código, ele viaja com o deploy e não depende de ninguém
 *     lembrar de configurar nada.
 *
 *  2. **A chave que ACENDE o botão é lida a cada requisição**, no servidor
 *     (`FOOCCI_SALES_WHATSAPP_ATIVO`). Sem `NEXT_PUBLIC_`, ela não entra em
 *     bundle nenhum: mudar no Railway vale na requisição seguinte, sem build.
 *
 * ── Por que existe um interruptor, e por que ele começa DESLIGADO ───────────
 * Botão de WhatsApp apontando para número que não atende é pior que botão
 * nenhum: o visitante manda mensagem, ninguém responde, e ele conclui que a
 * empresa está morta. O número só passa a atender depois que a Meta termina a
 * verificação. Enquanto isso, o site continua com a porta que FUNCIONA (o
 * formulário) em vez de uma porta bonita que não abre.
 *
 * Ausência de configuração = desligado (guardrail 1: silêncio não é permissão).
 *
 * ⚠️ SERVIDOR. Não importe isto de componente `"use client"`: `process.env` sem
 * `NEXT_PUBLIC_` chega vazio no navegador, e o botão sumiria sem explicação.
 */

// ⚠️ O número NÃO é digitado aqui desde 28/08/2026. Ele existia nesta linha e
// também em `marketing/config.ts`, com políticas diferentes — e trocar pelo
// Railway mudava só metade do site, sem erro nem log. Fonte única em
// `./numeroDeVendas`; o re-export mantém quem já importava daqui.
export { NUMERO_DE_VENDAS } from "./numeroDeVendas";
import { NUMERO_DE_VENDAS } from "./numeroDeVendas";

/** A mensagem que já vai escrita para a pessoa só apertar enviar. */
export const MENSAGEM_PADRAO = "Olá! Vim pelo site e quero tirar dúvidas sobre o Foocci.";

/**
 * O canal está no ar? Lido a cada chamada — nunca memorizado em módulo, senão a
 * primeira requisição depois do boot congelaria a resposta até o próximo deploy,
 * que é exatamente o defeito que este arquivo combate.
 */
export function canalDeVendasAtivo(): boolean {
  return (process.env.FOOCCI_SALES_WHATSAPP_ATIVO ?? "").trim().toLowerCase() === "true";
}

/** O link `wa.me` pronto. Existe mesmo com o canal desligado — quem decide é quem chama. */
export function linkDoWhatsAppDeVendas(mensagem: string = MENSAGEM_PADRAO): string {
  return `https://wa.me/${NUMERO_DE_VENDAS}?text=${encodeURIComponent(mensagem)}`;
}

/** Número em formato legível, para quem precisa LER e copiar. */
export function numeroLegivel(numero: string = NUMERO_DE_VENDAS): string {
  const br = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(numero);
  return br ? `+55 (${br[1]}) ${br[2]}-${br[3]}` : `+${numero}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  A chamada comercial do site — UMA decisão, tomada num lugar só
// ─────────────────────────────────────────────────────────────────────────────

import {
  AGENTE_CTA_LABEL,
  AGENTE_NOTE,
  AGENTE_URL,
  CONTATO_NOTE,
  DEMO_CTA_LABEL,
} from "@/components/marketing/config";

export interface ChamadaComercial {
  /** Para onde o botão aponta. É sempre o caminho interno — quem desvia é o servidor. */
  href: string;
  /** O texto do botão. */
  label: string;
  /** A frase sob o botão, descrevendo o que acontece depois do clique. */
  note: string;
  /** O canal está no ar? Serve para a tela decidir se mostra o botão do WhatsApp. */
  ativo: boolean;
}

/**
 * O botão laranja do site, resolvido no servidor.
 *
 * O par TEXTO+DESTINO nunca se separa: enquanto o canal está desligado o botão
 * continua dizendo o que ele de fato faz (leva ao formulário). Botão escrito
 * "fale com nosso agente" que cai num formulário é promessa quebrada no primeiro
 * clique — e é assim que se ensina o visitante a não confiar no site.
 */
export function chamadaComercial(): ChamadaComercial {
  const ativo = canalDeVendasAtivo();
  return {
    href: AGENTE_URL,
    label: ativo ? AGENTE_CTA_LABEL : DEMO_CTA_LABEL,
    note: ativo ? AGENTE_NOTE : CONTATO_NOTE,
    ativo,
  };
}
