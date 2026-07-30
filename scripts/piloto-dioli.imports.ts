/**
 * As peças que o piloto usa, num lugar só.
 *
 * Existe por um motivo prático: importar `@/services/brain` é o que REGISTRA os
 * manuais da Oficina (restaurante e agência). Um script que fosse buscar
 * `rodarEsteira` pelo caminho fundo pularia esse registro e reprovaria a peça
 * por um motivo falso — "domínio sem manual" quando o manual existe.
 *
 * Reunir aqui deixa essa dependência visível em vez de escondida numa ordem
 * de import que qualquer refatoração desfaz sem perceber.
 */

export {
  avaliarSondagem,
  gerarPlano,
  renderizarPlano,
  rodarEsteira,
  registeredDominios,
  buscarVerdade,
} from "@/services/brain";

export { atender } from "@/services/brain/oficina/PortaDaOficina";
export { selectEngine } from "@/services/brain/engines/AIEngineRouter";
export { callStructuredJson } from "@/services/brain/engines/OpenAIEngineAdapter";
export { briefingFoocci, RESPOSTAS } from "@/services/brain/sdr/pilotos/BriefingFoocci";
export { snapshotDoBriefing } from "@/services/brain/knowledge/AgencyKnowledgeAdapter";
export { snapshotParaVerdade } from "@/services/brain/oficina/TruthSource";
