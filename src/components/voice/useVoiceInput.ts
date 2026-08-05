"use client";

/**
 * useVoiceInput — ditado por voz. **O gancho único de microfone do produto.**
 *
 * Grava com MediaRecorder e transcreve no servidor (Whisper, via
 * /api/help/transcribe). Todo campo de escrita de chat do Foocci usa ESTE
 * gancho + o <VoiceButton> ao lado — nunca uma implementação própria. Já
 * existiram três cópias (Assistente, Ajuda técnica, Campanha por IA) e cada
 * uma tinha um defeito diferente: uma desenhava o botão em navegador sem
 * microfone, outra enviava o áudio direto sem deixar a pessoa revisar.
 *
 * As regras que este arquivo carrega, e que valem para todos os chats:
 *
 *  1. `supported` só é resolvido DEPOIS do mount (o servidor não sabe se o
 *     navegador tem microfone) e a UI só desenha o botão quando ele é `true`.
 *     Botão de microfone que não grava é pior que microfone nenhum.
 *  2. O texto transcrito **cai no campo** para a pessoa revisar e apertar
 *     enviar. Transcrição erra; mensagem errada enviada custa mais que um
 *     toque a mais.
 *  3. Se já havia texto, a transcrição **acrescenta** — não substitui.
 *     (ver `appendTranscript`)
 *  4. O erro é frase de gente, com o próximo passo. Nada de nome de exceção
 *     do navegador na cara do lojista.
 *
 * ⚠️ A rota de transcrição exige sessão de LOJISTA (getTenantContext). Não
 * ligue este gancho em superfície pública (loja do cliente) nem na área
 * /admin sem antes existir uma rota que autorize aquela plateia — o botão
 * apareceria e tomaria 401 em silêncio, que é o pior dos mundos.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_ENDPOINT = "/api/help/transcribe";

/** Tamanho máximo aceito antes de gastar uma chamada paga à toa. */
const MAX_BLOB_BYTES = 24 * 1024 * 1024;

export interface UseVoiceInput {
  /** O navegador grava de verdade? Só desenhe o botão quando `true`. */
  supported: boolean;
  recording: boolean;
  transcribing: boolean;
  /** Frase pronta para mostrar a quem não é técnico — já traz o próximo passo. */
  error: string | null;
  toggle: () => void;
  clearError: () => void;
}

export interface VoiceInputOptions {
  /** Rota de transcrição. Default: a do painel do lojista. */
  endpoint?: string;
  /** Nome do arquivo enviado — só ajuda no log do servidor. */
  fileName?: string;
}

/**
 * Acrescenta a transcrição ao que já estava escrito (regra 3).
 * Use sempre isto no `onText` — nunca `setDraft(text)`.
 */
export function appendTranscript(previous: string, incoming: string): string {
  const base = previous.trimEnd();
  const text = incoming.trim();
  if (!text) return previous;
  if (!base) return text;
  return `${base} ${text}`;
}

/** Traduz a falha do getUserMedia para uma frase que ensina o próximo passo. */
function microphoneErrorMessage(err: unknown): string {
  const name = typeof err === "object" && err && "name" in err ? String((err as Error).name) : "";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "O microfone está bloqueado para este site. Toque no cadeado ao lado do endereço, marque Permitir microfone e tente de novo.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Não encontrei nenhum microfone neste aparelho. Conecte um fone com microfone ou digite sua mensagem.";
    case "NotReadableError":
      return "Outro aplicativo está usando o microfone. Feche a chamada ou o gravador que está aberto e tente de novo.";
    default:
      return "Não consegui ligar o microfone agora. Você pode digitar sua mensagem normalmente.";
  }
}

/** Traduz a falha da transcrição — inclusive a sessão que caiu. */
export function transcribeErrorMessage(status: number, serverMessage?: string): string {
  if (status === 401 || status === 403) {
    return "Sua sessão expirou. Atualize a página, entre de novo e o microfone volta a funcionar.";
  }
  if (status === 413) {
    return "O áudio ficou longo demais. Grave um trecho mais curto e mande em duas partes.";
  }
  if (serverMessage) return serverMessage;
  return "Não consegui entender o áudio. Tente falar mais perto do microfone ou digite.";
}

export function useVoiceInput(
  onText: (text: string) => void,
  options: VoiceInputOptions = {},
): UseVoiceInput {
  const { endpoint = DEFAULT_ENDPOINT, fileName = "ditado.webm" } = options;

  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        typeof window.MediaRecorder !== "undefined" &&
        typeof navigator !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia),
    );
  }, []);

  // Nunca deixa o microfone ligado quando o componente sai de cena.
  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop();
      } catch {
        // já parado
      }
    };
  }, []);

  const transcribe = useCallback(
    async (blob: Blob) => {
      setTranscribing(true);
      try {
        const form = new FormData();
        form.append("audio", blob, fileName);
        const res = await fetch(endpoint, { method: "POST", body: form });
        const json = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
        if (!res.ok || !json.text) {
          setError(transcribeErrorMessage(res.status, json.error));
          return;
        }
        onTextRef.current(json.text);
      } catch {
        setError("Falha ao enviar o áudio. Verifique a conexão e tente de novo.");
      } finally {
        setTranscribing(false);
      }
    },
    [endpoint, fileName],
  );

  const toggle = useCallback(() => {
    setError(null);

    if (recorderRef.current && recording) {
      try {
        recorderRef.current.stop();
      } catch {
        setRecording(false);
      }
      return;
    }

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream);
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          setRecording(false);
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          if (blob.size === 0) {
            setError("Não gravou nada. Segure o botão por mais tempo e fale perto do microfone.");
            return;
          }
          if (blob.size > MAX_BLOB_BYTES) {
            setError(
              "O áudio ficou longo demais. Grave um trecho mais curto e mande em duas partes.",
            );
            return;
          }
          void transcribe(blob);
        };
        recorderRef.current = rec;
        rec.start();
        setRecording(true);
      } catch (err) {
        setError(microphoneErrorMessage(err));
        setRecording(false);
      }
    })();
  }, [recording, transcribe]);

  const clearError = useCallback(() => setError(null), []);

  return { supported, recording, transcribing, error, toggle, clearError };
}
