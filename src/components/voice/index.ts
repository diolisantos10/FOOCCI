/**
 * Microfone do Foocci — porta única.
 *
 * Todo campo de escrita de chat importa daqui. Se você está escrevendo
 * `new MediaRecorder(...)` numa tela, pare: a peça já existe e corrigir bug
 * em um lugar só vale para todos se todos usarem esta porta.
 */

export { useVoiceInput, appendTranscript } from "./useVoiceInput";
export type { UseVoiceInput, VoiceInputOptions } from "./useVoiceInput";
export { VoiceButton, VoiceStatus, MicIcon } from "./VoiceButton";
