/**
 * LISTA FRIA ≠ LEAD — a distinção, em código, e num lugar só.
 *
 * ── A ORDEM QUE ORIGINOU ESTE ARQUIVO ───────────────────────────────────────
 *
 * CEO, 17/09/2026: *"A lista fria não é lead. Ela só é lead quando se interessa
 * sobre o produto e quer escutar. Isso precisa estar cristalino em todos os
 * cantos do departamento comercial."*
 *
 * ── O DEFEITO MEDIDO ────────────────────────────────────────────────────────
 *
 * `materializarLead` criava o contato de prospecção com `stage: "NOVO"`, e
 * `NOVO` se escreve na tela como **"Novo lead"**. Ou seja: o restaurante que NÓS
 * fomos caçar na internet aparecia para o vendedor com o mesmo selo de quem
 * tinha acabado de preencher o formulário pedindo demonstração. A tela chamava
 * de lead exatamente quem o CEO diz que não é lead.
 *
 * Não era um erro de palavra: era um erro de FILA. Quem confia no selo trabalha
 * a lista errada primeiro.
 *
 * ── AS DUAS PERGUNTAS, E POR QUE SÃO DUAS ───────────────────────────────────
 *
 * 1. **Ele nos procurou?** — responde `fonte`, a porta de entrada, que nunca
 *    muda. Formulário, campanha, WhatsApp direto: a pessoa deixou o contato.
 *    Lista de prospecção, indicação, importação: nós fomos atrás.
 * 2. **Ele se interessou?** — responde `virouLeadEm`, escrito UMA vez, no
 *    instante do interesse, por `promoverFrioParaLead`.
 *
 * Uma só não bastaria. Se olhasse apenas a fonte, o contato frio que disse "me
 * explica melhor" continuaria sendo tratado como lista fria para sempre. Se
 * olhasse apenas a promoção, quem chegou pelo formulário — que JÁ é lead, sem
 * ter passado por promoção nenhuma — ficaria de fora.
 *
 * ── ⚠️ E A PROMOÇÃO NÃO ACONTECE NA ABORDAGEM ───────────────────────────────
 *
 * Ter recebido a nossa mensagem não é interesse. Ter respondido "quem é?" não é
 * interesse. Interesse é querer escutar sobre o produto — e é só isso que
 * promove. Adiantar o carimbo encheria a fila do vendedor de gente que nunca
 * pediu nada, que é o defeito que esta distinção existe para impedir.
 */

import type { SiteLeadSource } from "@prisma/client";

/**
 * As portas por onde NÓS fomos atrás da pessoa.
 *
 * ⚠️ Lista de inclusão, e não de exclusão, de propósito: uma porta nova
 * (`INSTAGRAM`, `CAMPANHA_PAGA`…) é quase sempre alguém que nos procurou, e
 * errar para o lado de "é lead" é o erro barato. O caro é o contrário — tratar
 * como lead quem nunca falou com a gente e despejar pitch em cima dele.
 */
export const FONTES_DE_LISTA_FRIA: readonly SiteLeadSource[] = [
  "LISTA_PROSPECCAO",
  "INDICACAO",
  "IMPORTACAO",
];

export interface SinalDeFrioOuLead {
  /** A porta de entrada. `null`/ausente = desconhecida, e aí vale o estágio. */
  fonte?: SiteLeadSource | null;
  /** Quando o contato frio demonstrou interesse. `null` = nunca foi promovido. */
  virouLeadEm?: Date | null;
}

/** Nós fomos buscar esta pessoa? (Independe de ela já ter se interessado.) */
export function veioDeListaFria(p: SinalDeFrioOuLead): boolean {
  return p.fonte ? FONTES_DE_LISTA_FRIA.includes(p.fonte) : false;
}

/**
 * **É lead?** A pergunta do CEO, respondida em uma linha.
 *
 * Lead é quem deixou o próprio contato **ou** quem, sendo frio, demonstrou
 * interesse e quis escutar.
 */
export function ehLead(p: SinalDeFrioOuLead): boolean {
  if (p.virouLeadEm) return true;
  return !veioDeListaFria(p);
}

/**
 * Como este registro se CHAMA na tela, no relatório e na fila.
 *
 * Existe para que ninguém precise reescrever a regra ao montar uma etiqueta —
 * regra copiada é regra que diverge. `"contato frio"` é deliberadamente uma
 * palavra que não é "lead": a tela não pode usar a mesma palavra para os dois.
 */
export function comoSeChama(p: SinalDeFrioOuLead): "lead" | "contato frio" {
  return ehLead(p) ? "lead" : "contato frio";
}
