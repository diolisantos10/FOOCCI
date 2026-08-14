/**
 * A VERSÃO da política de privacidade do site — fonte única.
 *
 * ── Por que uma constante, e não um texto solto na página ───────────────────
 * A partir de 14/08/2026 todo contato capturado grava **a que versão da política
 * a pessoa consentiu** (`SiteLead.consentPolicyVersion`). Sem isso, o registro de
 * consentimento diria apenas "aceitou alguma coisa, algum dia" — que é o mesmo
 * que não registrar nada, porque a política muda e o aceite não volta atrás.
 *
 * A página e o registro leem daqui. Duas cópias da mesma data é como elas
 * silenciosamente param de bater, e aí o registro passa a apontar para uma versão
 * que ninguém leu.
 *
 * ⚠️ REGRA DE MANUTENÇÃO: mudou o TEXTO da política? Mude estas duas linhas na
 * mesma sessão. Contato gravado antes de 14/08 fica com `consentPolicyVersion`
 * nulo — e nulo aqui significa exatamente "versão não registrada", nunca
 * "não consentiu" (guardrail 1).
 */

/** Chave estável, gravada no banco. Formato ISO para ordenar sozinha. */
export const POLITICA_PRIVACIDADE_VERSAO = "2026-06-04";

/** A mesma data como a pessoa lê na página. */
export const POLITICA_PRIVACIDADE_ATUALIZADA_EM = "4 de junho de 2026";
