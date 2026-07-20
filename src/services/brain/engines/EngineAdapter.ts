/**
 * EngineAdapter — o contrato comum de todo piloto (IA) plugado no Brain.
 *
 * "A IA é o piloto: troca-troca." Cada provider implementa UMA função de
 * chamada estruturada; o dispatcher (callStructuredJson) roteia pela seleção
 * do AIEngineRouter. Nenhum consumidor do Brain conhece SDK de provider.
 */

import type { AIEngineSelection } from "./AIEngineTypes";

export interface StructuredCallInput {
  selection: AIEngineSelection;
  systemPrompt: string;
  userContent: string;
  temperature?: number;
  maxTokens?: number;
  /** "json" (default) força objeto JSON; "text" devolve texto livre. */
  responseFormat?: "json" | "text";
  /**
   * Entrada visual opcional (data URL base64, ex.: leitura de nota de compra).
   * Suportada hoje pelo piloto OPENAI; os demais lançam erro claro — o caller
   * decide o fallback, como em qualquer falha de engine.
   */
  imageDataUrl?: string;
}

/** Cada adapter de provider implementa isto. Lança em erro — o caller decide o fallback. */
export type EngineCall = (input: StructuredCallInput) => Promise<string>;
