/**
 * EngineDispatcher — a PORTA ÚNICA por onde qualquer consumidor do Brain fala
 * com uma IA.
 *
 * POR QUE ESTE ARQUIVO NASCEU (24/09/2026)
 * ----------------------------------------
 * A regra de ouro da casa é: **o nome do modelo mora no roteador, nunca no
 * agente**. O dispatcher vivia dentro de `OpenAIEngineAdapter.ts`, e todo
 * consumidor escrevia `import { callStructuredJson } from ".../OpenAIEngineAdapter"`.
 * Funcionava — o dispatcher já roteava para CLAUDE e GEMINI —, mas a PORTA
 * estava com o nome de um laboratório cravado no import. Nome de laboratório no
 * caminho do consumidor é a mesma doença que nome de modelo no agente: quem lê
 * o código conclui que a escolha do roteador não vale, e um dia alguém "conserta"
 * chamando a OpenAI direto porque "já era OpenAI mesmo".
 *
 * A porta agora é neutra. `OpenAIEngineAdapter` reexporta `callStructuredJson`
 * por compatibilidade (dezenas de consumidores antigos), mas consumidor NOVO
 * importa daqui.
 *
 * O adapter da OpenAI entra por import dinâmico de propósito: assim este arquivo
 * não depende estaticamente de nenhum laboratório, e o teste arquitetural
 * (services/brain/architecture.test.ts) continua com UMA única porta de SDK por
 * provedor.
 */

import type { AIEngineSelection } from "./AIEngineTypes";
import type { StructuredCallInput } from "./EngineAdapter";

export interface StructuredJsonCallInput extends StructuredCallInput {
  selection: AIEngineSelection;
}

/**
 * Uma chamada estruturada através do piloto roteado. Lança em erro — quem chama
 * decide o fallback (o BrainReasoner cai no determinístico que nunca inventa).
 */
export async function callStructuredJson(input: StructuredJsonCallInput): Promise<string> {
  switch (input.selection.provider) {
    case "OPENAI": {
      const { callOpenAI } = await import("./OpenAIEngineAdapter");
      return callOpenAI(input);
    }
    case "CLAUDE": {
      if (input.imageDataUrl) {
        throw new Error("Entrada de imagem ainda não suportada no piloto CLAUDE — roteie para OPENAI.");
      }
      const { callAnthropic } = await import("./AnthropicEngineAdapter");
      return callAnthropic(input);
    }
    case "GEMINI": {
      if (input.imageDataUrl) {
        throw new Error("Entrada de imagem ainda não suportada no piloto GEMINI — roteie para OPENAI.");
      }
      const { callGemini } = await import("./GeminiEngineAdapter");
      return callGemini(input);
    }
    default:
      throw new Error(`Engine ${input.selection.provider} não implementado — use o fallback determinístico.`);
  }
}
