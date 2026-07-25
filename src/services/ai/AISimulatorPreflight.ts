/**
 * AISimulatorPreflight — checagem de "dá pra rodar o teste?" ANTES de gastar
 * 10 cenários contra a OpenAI.
 *
 * Sem isto, o primeiro teste de um restaurante novo falha de forma CRÍPTICA:
 *   • cardápio vazio → a IA não tem o que oferecer → todos os cenários abandonam
 *     e o relatório vem 100% vermelho com "carrinho vazio" (parece bug, não é).
 *   • chave da IA ausente → toda chamada volta 401 → 10 cartões vermelhos com um
 *     erro técnico que o lojista não tem como entender.
 *
 * O pré-voo troca esse silêncio por um MOTIVO CLARO em português. Puro/testável:
 * recebe os fatos (não lê env nem DB), pra rodar em teste sem mockar nada.
 */

/** A chave só conta como "conectada" se for um valor real (não o placeholder). */
export function isAiKeyConfigured(apiKey: string | undefined | null): boolean {
  return !!apiKey && apiKey.trim().length > 0 && apiKey.trim() !== "not-configured";
}

export interface SimulatorReadinessFacts {
  /** Quantos itens ativos existem no cardápio do restaurante. */
  menuCount: number;
  /** true quando a OPENAI_API_KEY é um valor real (ver isAiKeyConfigured). */
  aiKeyConfigured: boolean;
}

/**
 * Motivo (em PT, pronto pra mostrar ao lojista) para NÃO rodar o simulador —
 * ou `null` quando está tudo pronto. A ordem importa: primeiro o bloqueio de
 * infra (chave), que o lojista não resolve sozinho, depois o de dados (cardápio),
 * que ele resolve — assim nunca mandamos "cadastre o cardápio" quando o problema
 * real é a chave.
 */
export function simulatorBlockReason(facts: SimulatorReadinessFacts): string | null {
  if (!facts.aiKeyConfigured) {
    return "A IA ainda não está conectada aqui — a chave de acesso não está configurada no servidor. Sem ela o teste não roda. Avise o suporte da Foocci para ativar.";
  }
  if (facts.menuCount <= 0) {
    return "Seu cardápio está vazio. Cadastre alguns pratos antes de rodar o teste — a IA precisa ter o que oferecer para o cliente.";
  }
  return null;
}
