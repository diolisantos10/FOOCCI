/**
 * Official site asset slots — server-only helper.
 *
 * The approved mockup uses real photography (restaurant ambience + journey
 * lifestyle shots). Those files are delivered by the founder and dropped into
 * `public/brand/foocci/site/` with the EXACT names below. Components check the
 * slot at request time (/site is force-dynamic): when a file exists it renders
 * automatically — no code change needed. Until then, faithful structural
 * fallbacks (official mascot/anagram + warm tones) keep the layout identical.
 *
 * Do NOT import from client components (uses fs).
 */

import fs from "fs";
import path from "path";

const PUBLIC_DIR = path.join(process.cwd(), "public");

/** True when a file exists under /public (path relative, no leading slash). */
export function hasAsset(rel: string): boolean {
  try {
    return fs.existsSync(path.join(PUBLIC_DIR, rel));
  } catch {
    return false;
  }
}

/** Canonical asset slots (relative to /public). */
export const SITE_ASSETS = {
  /**
   * Approved home hero — the FULL composed scene (restaurant ambience + mascot
   * host + speech bubble + black F tile), exactly as in the official mockup.
   * Rendered flat so the art direction is never reinterpreted in CSS.
   */
  heroComposed: "brand/foocci/site/hero-restaurant-with-mascot.png",
  /**
   * Empty warm restaurant scene (curved counter, no mascot/text) — the stage
   * used as soft ambiance on internal pages so they share the home's language.
   */
  heroBackground: "brand/foocci/site/hero-restaurant-background.png",
  /** Journey medallions (square/circular crops). */
  journey: [
    "brand/foocci/site/journey-1-cliente.jpg",   // mulher sorrindo com celular
    "brand/foocci/site/journey-2-pedido.jpg",    // mão com app Foocci
    "brand/foocci/site/journey-3-crm.jpg",       // homem com celular
    "brand/foocci/site/journey-4-campanha.jpg",  // prato premium
    "brand/foocci/site/journey-5-volta.jpg",     // casal jantando
  ],
  /** Owner/chef with tablet (institutional). */
  ownerTablet: "brand/foocci/site/owner-tablet.jpg",
  /** Foocci app on phone in restaurant (product shot). */
  appPhone: "brand/foocci/site/app-phone.jpg",
} as const;

/**
 * O PRODUTO DE VERDADE, fotografado (2026-08-05).
 *
 * O CEO olhou o site e viu o que faltava: "só texto, botão e detalhe gráfico".
 * Ele estava certo — seis das oito páginas abriam sem uma única imagem.
 *
 * A resposta NÃO é banco de imagens. Todo arquivo aqui é uma captura da tela
 * real do Foocci rodando na padaria de demonstração (`foocci-bakery`) — mesmo
 * cardápio, mesmo painel, mesmo agente que o visitante encontra em
 * `/site/experimente`. Consequências práticas, e é por isso que vale a pena:
 *
 *  • **Não existe distância entre a foto e o produto.** Nada aqui promete tela
 *    que não existe — guardrail 7 aplicado à imagem, não só ao texto.
 *  • **Envelhece junto.** Mudou a tela, a captura fica velha e dá para refazer
 *    rodando o mesmo roteiro (`scripts/site/capturar-produto.mjs`).
 *
 * Slots vazios são normais: `hasAsset()` faz a página cair no visual anterior
 * em vez de quebrar. Ausência de arquivo nunca vira erro de layout.
 */
export const PRODUCT_SHOTS = {
  /** Cardápio da padaria no celular — a loja que o cliente final vê. */
  lojaCelular: "brand/foocci/produto/loja-cardapio-celular.png",
  /** Conversa com o agente no cardápio: pergunta do cliente e resposta. */
  atendimentoCelular: "brand/foocci/produto/atendimento-conversa-celular.png",
  /** Painel do lojista: os pedidos chegando, no desktop. */
  painelPedidos: "brand/foocci/produto/painel-pedidos-desktop.png",
  /** Painel do lojista: CRM — campanhas e o retorno que elas deram. */
  painelCrm: "brand/foocci/produto/painel-crm-desktop.png",
  /** Painel do lojista: a visão de resultado (o que o dono abre de manhã). */
  painelResultado: "brand/foocci/produto/painel-resultado-desktop.png",
} as const;
