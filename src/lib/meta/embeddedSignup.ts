/**
 * Parâmetros do Cadastro Incorporado (Embedded Signup) da Meta — e a trava que impede
 * o fluxo de coexistência de virar o fluxo que TIRA o número do celular.
 *
 * O QUE MUDOU EM 14/08/2026, E POR QUE ISTO PASSOU A EXISTIR
 * ---------------------------------------------------------
 * Descobriu-se, percorrendo o fluxo na mão, que **a mesma configuração serve os dois
 * caminhos**: com `config_id=1571394541276497` e `featureType=whatsapp_business_app_onboarding`
 * a Meta abre `WHATSAPP_BUSINESS_APP_ONBOARDING_PHONE_CREATION` (coexistência, o número
 * segue no aparelho); **sem** o `featureType`, a mesma configuração abre o cadastro
 * padrão, que oferece MIGRAR o número para a Cloud API — e migrar **tira o número do
 * celular do restaurante**.
 *
 * Consequência dura: quando `META_COEXISTENCE_CONFIG_ID` e `META_CONFIG_ID` têm o MESMO
 * valor — que é o caso —, a única coisa que separa "mantém no celular" de "arranca do
 * celular" é **uma string dentro de `extras`**. Um refactor que a perca transforma um
 * botão rotulado *"o número segue no celular"* numa operação destrutiva, silenciosa e
 * irreversível para quem atende cliente naquele aparelho.
 *
 * A proteção anterior (recusar quando não há config id dedicada) **deixa de cobrir esse
 * caso**, justamente porque agora o id existe e é o mesmo. Guardrail 4 — prompt é aviso,
 * código é trava: aqui o fluxo de coexistência sem `featureType` é **erro**, não descuido.
 */

/** Qual dos dois caminhos do Cadastro Incorporado está sendo aberto. */
export type EmbeddedSignupFlow = "padrao" | "coexistencia";

/** O `featureType` que a Meta exige para abrir o fluxo que mantém o número no celular. */
export const COEXISTENCE_FEATURE_TYPE = "whatsapp_business_app_onboarding";

export interface EmbeddedSignupParams {
  config_id: string;
  response_type: "code";
  override_default_response_type: true;
  extras: { setup: Record<string, unknown>; featureType?: string };
}

/**
 * Monta os parâmetros do `FB.login`. Lança quando o fluxo é de coexistência e o
 * `featureType` não está presente — porque nesse estado a chamada abriria o cadastro
 * padrão e poderia arrancar o número do aparelho do restaurante.
 *
 * Lançar aqui é deliberado e é o lado seguro: o custo de falhar é um botão que não abre
 * e um aviso na tela; o custo de deixar passar é o restaurante perder o WhatsApp em que
 * atende cliente, sem aviso e sem volta (guardrail 5 — a proteção nunca pode ser mais
 * destrutiva que o problema, e aqui ela é muito menos).
 */
export function buildEmbeddedSignupParams(input: {
  configId: string;
  flow: EmbeddedSignupFlow;
  featureType?: string;
}): EmbeddedSignupParams {
  const { configId, flow } = input;

  if (!configId) {
    throw new Error("Cadastro Incorporado sem config_id — a Meta não tem o que abrir.");
  }

  if (flow === "coexistencia") {
    const featureType = input.featureType ?? COEXISTENCE_FEATURE_TYPE;
    if (featureType !== COEXISTENCE_FEATURE_TYPE) {
      throw new Error(
        "Fluxo de coexistência exige featureType=" + COEXISTENCE_FEATURE_TYPE
        + ". Sem ele a Meta abre o cadastro padrão, que MIGRA o número — e isso"
        + " tira o número do celular do restaurante.",
      );
    }
    return {
      config_id: configId,
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {}, featureType },
    };
  }

  return {
    config_id: configId,
    response_type: "code",
    override_default_response_type: true,
    extras: { setup: {} },
  };
}
