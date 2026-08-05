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
 *  5. **O áudio gravado NUNCA se perde numa falha.** (05/08/2026) Enquanto a
 *     transcrição não deu certo, o blob fica em `pendingAudio`: dá para tocar
 *     em "Tentar de novo" com a MESMA gravação, ou anexar o áudio para um
 *     humano ouvir. Guardrail 5 — a proteção não pode custar mais que o
 *     problema que ela evita. Antes, um aviso vermelho apagava a fala do
 *     lojista e ele tinha que gravar tudo outra vez.
 *  6. **O formato é o que o navegador REALMENTE gravou.** (05/08/2026) O
 *     código antigo carimbava `audio/webm` e o nome `.webm` em toda gravação.
 *     No iPhone o Safari grava **MPEG-4**, não webm — e o Whisper decide o
 *     formato pelo nome do arquivo. Resultado: todo ditado feito de iPhone
 *     chegava rotulado errado e voltava recusado. Agora o tipo e a extensão
 *     saem de `MediaRecorder.mimeType`.
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

/** O áudio que ainda não virou texto. Enquanto existir, nada foi perdido. */
export interface PendingAudio {
  blob: Blob;
  /** Nome com a extensão REAL do que foi gravado (o Whisper lê a extensão). */
  fileName: string;
  mimeType: string;
  bytes: number;
}

export interface UseVoiceInput {
  /** O navegador grava de verdade? Só desenhe o botão quando `true`. */
  supported: boolean;
  recording: boolean;
  transcribing: boolean;
  /** Frase pronta para mostrar a quem não é técnico — já traz o próximo passo. */
  error: string | null;
  /** Código da falha (vem do servidor). Serve para decidir o que oferecer. */
  errorCode: string | null;
  /** Repetir a MESMA gravação tem chance de dar certo? */
  canRetry: boolean;
  /** A gravação que não virou texto — para repetir ou anexar. Nunca some sozinha. */
  pendingAudio: PendingAudio | null;
  toggle: () => void;
  /** Manda de novo o áudio guardado. Não regrava nada. */
  retry: () => void;
  clearError: () => void;
  /** Descarta a gravação guardada — só por ação explícita de quem gravou. */
  discardPending: () => void;
}

export interface VoiceInputOptions {
  /** Rota de transcrição. Default: a do painel do lojista. */
  endpoint?: string;
  /**
   * Base do nome do arquivo enviado — só ajuda no log do servidor. A extensão
   * é ignorada e substituída pela do formato realmente gravado.
   */
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

/**
 * Formatos de gravação, em ordem de preferência, com a extensão que o Whisper
 * entende. `audio/mp4` está aqui porque é o ÚNICO que o Safari do iPhone grava.
 */
const RECORDING_CANDIDATES: ReadonlyArray<{ mime: string; ext: string }> = [
  { mime: "audio/webm;codecs=opus", ext: "webm" },
  { mime: "audio/webm", ext: "webm" },
  { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  { mime: "audio/ogg", ext: "ogg" },
  { mime: "audio/mp4;codecs=mp4a.40.2", ext: "m4a" },
  { mime: "audio/mp4", ext: "m4a" },
  { mime: "audio/mpeg", ext: "mp3" },
];

/** Extensão que o Whisper espera para um dado mimeType de gravação. */
export function extensionForMime(mime: string): string {
  const type = (mime || "").split(";")[0]!.trim().toLowerCase();
  switch (type) {
    case "audio/webm":
    case "video/webm":
      return "webm";
    case "audio/ogg":
    case "audio/oga":
      return "ogg";
    case "audio/mp4":
    case "audio/x-m4a":
    case "audio/m4a":
    case "video/mp4":
      return "m4a";
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
    case "audio/wave":
      return "wav";
    case "audio/flac":
      return "flac";
    default:
      // Sem pista nenhuma, webm é o palpite certo em todo navegador que não é
      // Safari — e o Safari SEMPRE informa `audio/mp4`, então cai no case acima.
      return "webm";
  }
}

/** O primeiro formato da lista que ESTE navegador grava de verdade. */
export function pickRecordingMime(
  isSupported: (mime: string) => boolean,
): string | null {
  for (const c of RECORDING_CANDIDATES) {
    if (isSupported(c.mime)) return c.mime;
  }
  return null;
}

/** Troca a extensão do nome pedido pela extensão do que foi realmente gravado. */
export function fileNameForMime(base: string, mime: string): string {
  const stem = base.replace(/\.[a-z0-9]+$/i, "") || "ditado";
  return `${stem}.${extensionForMime(mime)}`;
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

/**
 * Traduz a falha da transcrição. O servidor já manda a frase certa e o código;
 * o que sobra aqui é o caso de a resposta nem ser JSON (proxy, 502 de borda).
 */
export function transcribeErrorMessage(status: number, serverMessage?: string): string {
  if (serverMessage) return serverMessage;
  if (status === 401 || status === 403) {
    return "Sua sessão expirou. Atualize a página, entre de novo e o microfone volta a funcionar.";
  }
  if (status === 413) {
    return "O áudio ficou longo demais. Grave um trecho mais curto e mande em duas partes.";
  }
  return "Não consegui transcrever agora. Sua gravação está guardada aqui — toque em Tentar de novo ou digite.";
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
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [pendingAudio, setPendingAudio] = useState<PendingAudio | null>(null);

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
    async (audio: PendingAudio) => {
      setTranscribing(true);
      try {
        const form = new FormData();
        form.append("audio", audio.blob, audio.fileName);
        const res = await fetch(endpoint, { method: "POST", body: form });
        const json = (await res.json().catch(() => ({}))) as {
          text?: string;
          error?: string;
          code?: string;
          retriable?: boolean;
        };
        if (!res.ok || !json.text) {
          setError(transcribeErrorMessage(res.status, json.error));
          setErrorCode(json.code ?? `HTTP_${res.status}`);
          // Regra 5: a gravação continua aqui. Repetir só é oferecido quando
          // o servidor disse que repetir tem chance — mas o áudio fica de pé
          // de qualquer jeito, para poder ser anexado a um humano.
          setCanRetry(json.retriable ?? res.status >= 500);
          setPendingAudio(audio);
          return;
        }
        // Só agora a gravação pode ir embora: ela virou texto no campo.
        setPendingAudio(null);
        setCanRetry(false);
        setErrorCode(null);
        onTextRef.current(json.text);
      } catch {
        setError(
          "Falha ao enviar o áudio — verifique a conexão. Sua gravação está guardada aqui: toque em Tentar de novo.",
        );
        setErrorCode("NETWORK");
        setCanRetry(true);
        setPendingAudio(audio);
      } finally {
        setTranscribing(false);
      }
    },
    [endpoint],
  );

  const toggle = useCallback(() => {
    setError(null);
    setErrorCode(null);

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

        // Regra 6: pergunta ao navegador o que ele sabe gravar, em vez de supor.
        const isTypeSupported =
          typeof MediaRecorder.isTypeSupported === "function"
            ? (m: string) => MediaRecorder.isTypeSupported(m)
            : () => false;
        const preferred = pickRecordingMime(isTypeSupported);
        const rec = preferred
          ? new MediaRecorder(stream, { mimeType: preferred })
          : new MediaRecorder(stream);

        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          setRecording(false);

          // `rec.mimeType` é o que o navegador REALMENTE usou — no iPhone vem
          // "audio/mp4" mesmo tendo pedido webm. É ele que manda no nome.
          const realMime = rec.mimeType || preferred || chunksRef.current[0]?.type || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: realMime });

          if (blob.size === 0) {
            setError("Não gravou nada. Segure o botão por mais tempo e fale perto do microfone.");
            setErrorCode("EMPTY_AUDIO");
            setCanRetry(false);
            return;
          }
          if (blob.size > MAX_BLOB_BYTES) {
            setError(
              "O áudio ficou longo demais. Grave um trecho mais curto e mande em duas partes.",
            );
            setErrorCode("TOO_LARGE");
            setCanRetry(false);
            return;
          }
          void transcribe({
            blob,
            fileName: fileNameForMime(fileName, realMime),
            mimeType: realMime,
            bytes: blob.size,
          });
        };
        recorderRef.current = rec;
        rec.start();
        setRecording(true);
      } catch (err) {
        setError(microphoneErrorMessage(err));
        setErrorCode("MIC");
        setRecording(false);
      }
    })();
  }, [recording, transcribe, fileName]);

  const retry = useCallback(() => {
    if (!pendingAudio || transcribing) return;
    setError(null);
    setErrorCode(null);
    void transcribe(pendingAudio);
  }, [pendingAudio, transcribing, transcribe]);

  const clearError = useCallback(() => {
    setError(null);
    setErrorCode(null);
  }, []);

  const discardPending = useCallback(() => {
    setPendingAudio(null);
    setCanRetry(false);
    setError(null);
    setErrorCode(null);
  }, []);

  return {
    supported,
    recording,
    transcribing,
    error,
    errorCode,
    canRetry,
    pendingAudio,
    toggle,
    retry,
    clearError,
    discardPending,
  };
}
