/**
 * ⭐⭐ A VERSÃO DO CONTRATO COMUM — e a trava que impede quatro contratos.
 *
 * ─── O PROBLEMA, DITO SEM ROMANCE (decisão C3 do CEO, 30/08/2026) ───────────
 *
 * *"O contrato comum não pode virar quatro cópias independentes que evoluem de
 * maneira diferente."*
 *
 * A pasta `conector/` é copiada para quatro repositórios. **Copiável sem edição
 * não impede ninguém de editar.** Em três meses, alguém conserta um `if` no
 * CityJobs para resolver um caso urgente, não avisa ninguém, e a partir daí o
 * "contrato comum" são quatro contratos que se parecem. A divergência não vira
 * erro — é o defeito-mãe desta casa, e é o mesmo que já foi medido aqui em
 * 28/08/2026: *"duas cópias da mesma lista sempre divergem, e a divergência não
 * vira erro"*.
 *
 * ─── A TRAVA, E POR QUE ELA NÃO É UM COMENTÁRIO ─────────────────────────────
 *
 * Guardrail 4: *prompt é aviso; código é trava.* Um `// não editem isto` não
 * sobrevive a três meses e quatro repositórios. O que sobrevive é isto:
 *
 *   **cada arquivo comum tem a impressão digital do seu conteúdo gravada aqui,
 *   e um teste na CI de CADA produto refaz a conta e compara.**
 *
 * Editou uma linha de qualquer arquivo comum, em qualquer um dos quatro
 * repositórios? A CI daquele produto fica **vermelha**, dizendo qual arquivo
 * divergiu. Não há como a divergência passar em silêncio — que era o ponto.
 *
 * ─── COMO SE MUDA O CONTRATO, ENTÃO ─────────────────────────────────────────
 *
 * Mudança de contrato comum se faz **uma vez, no dono do padrão**, e depois se
 * copia. O rito é:
 *
 *   1. mudar o arquivo comum;
 *   2. subir `VERSAO_DO_CONTRATO` (maior se for incompatível, menor se somar);
 *   3. rodar `npm run test:unit -- compatibilidade` e colar as impressões novas
 *      que o teste imprime na falha (ele diz exatamente o que gravar);
 *   4. copiar a pasta inteira para os outros três produtos.
 *
 * O passo 4 não é opcional, e é justamente por isso que o passo 2 existe: um
 * produto que ficou para trás **diz** que ficou, na primeira mensagem que
 * trocar com o núcleo.
 *
 * ─── ⭐ E A INCOMPATIBILIDADE É BLOQUEADA, NÃO AVISADA ──────────────────────
 *
 * `MAIOR` diferente é incompatível: o núcleo e o produto deixam de falar a mesma
 * língua, e o conector **recusa** em vez de tentar adivinhar. Recusar é o
 * comportamento seguro: uma resposta entregue a um cliente com base num campo
 * que mudou de significado é pior do que uma resposta que não saiu.
 */

/**
 * ⭐ A versão do contrato comum. Semver, e cada número quer dizer uma coisa:
 *
 *   MAIOR  → mudou o que já existia (campo removido, sentido alterado, estado
 *            novo obrigatório). **Incompatível — bloqueia.**
 *   MENOR  → somou coisa nova, opcional. Compatível para trás.
 *   REMENDO→ correção que não muda o formato.
 */
export const VERSAO_DO_CONTRATO = "1.0.0" as const;

export interface VersaoLida {
  maior: number;
  menor: number;
  remendo: number;
}

export function lerVersao(bruta: string): VersaoLida | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(bruta.trim());
  if (!m) return null;
  return { maior: Number(m[1]), menor: Number(m[2]), remendo: Number(m[3]) };
}

export type Compatibilidade =
  | { compativel: true }
  | { compativel: false; motivo: string };

/**
 * ⭐ O outro lado fala a minha língua?
 *
 * ⚠️ A regra não é simétrica de propósito. Uma versão MENOR mais nova do outro
 * lado é compatível — ele somou campo opcional, e campo que eu não conheço eu
 * não leio. Uma versão MENOR mais nova **do meu lado** também é: eu posso
 * mandar campo que ele ignora. O que quebra é MAIOR diferente, sempre, nos dois
 * sentidos.
 */
export function contratoCompativel(
  minha: string,
  dele: string | null | undefined,
): Compatibilidade {
  // ⚠️ Ausência não é informação (guardrail 1): um núcleo que não declara versão
  // não está declarando compatibilidade. Mas também não é motivo para derrubar
  // a resposta de um gerente que já foi decidida — então isto passa, e passa
  // dizendo que passou sem prova.
  if (dele == null || !String(dele).trim()) return { compativel: true };

  const a = lerVersao(minha);
  const b = lerVersao(String(dele));
  if (!a) {
    return { compativel: false, motivo: `a versão local do contrato ("${minha}") não é um semver` };
  }
  if (!b) {
    return { compativel: false, motivo: `o outro lado declarou uma versão que não é um semver` };
  }
  if (a.maior !== b.maior) {
    return {
      compativel: false,
      motivo:
        `o contrato do conector é ${minha} e o outro lado fala ${dele}: a versão MAIOR é diferente, e ` +
        "isso quer dizer que algum campo mudou de sentido. O conector recusa em vez de adivinhar — uma " +
        "resposta entregue a um cliente com base num campo que mudou de significado é pior do que uma " +
        "resposta que não saiu. Quem estiver para trás copia a pasta `conector/` da versão nova.",
    };
  }
  return { compativel: true };
}

/**
 * ⭐ OS ARQUIVOS DO CONTRATO COMUM, e a impressão digital de cada um.
 *
 * SHA-256 do conteúdo do arquivo, em hexadecimal. O teste de compatibilidade
 * refaz a conta e compara — em todos os quatro produtos.
 *
 * ⚠️ **Este arquivo (`versao.ts`) não está na lista, e não pode estar**: ele
 * contém as impressões, e incluir a própria impressão dentro de si é uma conta
 * que não fecha. O que protege este arquivo é a lista: acrescentar um arquivo
 * comum sem registrá-lo aqui também reprova, porque o teste confere que a lista
 * cobre exatamente os `.ts` da pasta.
 */
export const ARQUIVOS_DO_CONTRATO: Readonly<Record<string, string>> = {
  "atendimento.ts": "ba1f766ff2f046fa843b10876d0a024f94c5a74bae76fef149b690adab8757eb",
  "aviso.ts": "067cd4b4278c59772ef3827f2426845c1e71469f982d7890299d33526bb36f66",
  "barreira.ts": "5d2abb11de7bed15bbc43ff945b467ab5f00ca4f5efe098003e68261452e15f3",
  "contrato.ts": "fa85dc360c084727f864299dca2efd2ed9fedcdde18b92e0f91ededee6ce4b0e",
  "ligacaoLocal.ts": "55c4f18bcd041e33716652f2b61c3c0ca4dec4c06ac93a3173d35d8c671b5455",
  "pendencias.ts": "822706440b87b97c89d73d7840ea41c367419170e0a5e86a6b4d74dee7dff282",
  "politicas.ts": "812bfb266cc3e9d404de61be37eff55e133e3548f920905ef2868b956b077f28",
  "retorno.ts": "28308a38a14549622ab1057d8b44fcdea40149e841e30ee1973668b24f4f0a03",
};
