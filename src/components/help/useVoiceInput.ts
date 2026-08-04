"use client";

/**
 * useVoiceInput — ditado por voz para o Assistente.
 *
 * Grava com MediaRecorder e transcreve no servidor (Whisper, via
 * /api/help/transcribe — o mesmo adaptador que a Ajuda técnica já usa).
 *
 * REGRA: `supported` é resolvido só DEPOIS do mount (o servidor não sabe se o
 * navegador tem microfone) e a UI só desenha o botão quando ele é `true`. Botão
 * de microfone que não grava é pior que microfone nenhum.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseVoiceInput {
  supported: boolean;
  recording: boolean;
  transcribing: boolean;
  error: string | null;
  toggle: () => void;
  clearError: () => void;
}

export function useVoiceInput(onText: (text: string) => void): UseVoiceInput {
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

  const transcribe = useCallback(async (blob: Blob) => {
    setTranscribing(true);
    try {
      const form = new FormData();
      form.append("audio", blob, "pergunta.webm");
      const res = await fetch("/api/help/transcribe", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok || !json.text) {
        setError(json.error ?? "Não consegui entender o áudio. Pode digitar?");
        return;
      }
      onTextRef.current(json.text);
    } catch {
      setError("Falha ao enviar o áudio. Verifique a conexão.");
    } finally {
      setTranscribing(false);
    }
  }, []);

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
            setError("Não gravou nada. Tente falar mais perto do microfone.");
            return;
          }
          void transcribe(blob);
        };
        recorderRef.current = rec;
        rec.start();
        setRecording(true);
      } catch {
        setError("Não consegui acessar o microfone. Você pode digitar sua dúvida.");
        setRecording(false);
      }
    })();
  }, [recording, transcribe]);

  const clearError = useCallback(() => setError(null), []);

  return { supported, recording, transcribing, error, toggle, clearError };
}
