"use client";

/**
 * useHelpThread — o estado da conversa com o Assistente Foocci.
 *
 * Mora ACIMA da janela de conversa (na barra do topo) de propósito: o lojista
 * minimiza e volta sem perder o que estava escrito nem pagar um "carregando"
 * novo. Fala só com o backend que já existe: /api/help/{thread,message,escalate,reset}.
 *
 * Os três estados obrigatórios (DESIGN.md §6.1) viajam explicitamente:
 * `status` cobre carregando/pronto/erro do histórico, e `sendError` cobre a
 * falha de envio — nunca uma bolha que some em silêncio.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type HelpRole = "USER" | "ASSISTANT" | "SUPPORT" | "SYSTEM";

export interface HelpAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  kind: "IMAGE" | "PDF" | "AUDIO";
  /** Caminho autenticado — o arquivo só abre para quem tem sessão do lojista. */
  url: string;
  createdAt: string;
}

export interface HelpChatMessage {
  id: string;
  role: HelpRole;
  content: string;
  authorName: string | null;
  createdAt: string;
  attachments?: HelpAttachment[];
}

export interface HelpThreadInfo {
  id: string;
  status: "OPEN" | "ESCALATED" | "RESOLVED";
  mode: "AI" | "HUMAN";
}

/**
 * Ação que o agente PROPÔS no turno (espelha SupportActionProposal do serviço —
 * declarada aqui para o componente de cliente não importar módulo de servidor).
 * É oferta com botão: `executed` é sempre false; quem confirma é o lojista.
 */
export interface HelpProposedAction {
  key: string;
  label: string;
  offer: string;
  cta: { label: string; href: string };
  humanConfirms: string;
  executed: boolean;
}

export interface HelpTicket {
  code: string;
  notified: boolean;
}

export type HelpLoadStatus = "idle" | "loading" | "ready" | "error";

export interface UseHelpThread {
  messages: HelpChatMessage[];
  thread: HelpThreadInfo | null;
  status: HelpLoadStatus;
  sending: boolean;
  /** O agente declarou que não resolve sozinho — a UI oferece o chamado. */
  shouldEscalate: boolean;
  escalating: boolean;
  resetting: boolean;
  ticket: HelpTicket | null;
  /** Oferta de ação do último turno (some quando o lojista segue perguntando). */
  proposedAction: HelpProposedAction | null;
  sendError: string | null;
  /**
   * Arquivos já escolhidos e ainda não enviados. Sobrevivem a fechar e reabrir
   * o balão — quem guarda é o servidor, não este estado.
   */
  pendingAttachments: HelpAttachment[];
  /** Sobe um arquivo como rascunho. A recusa vira `attachError`. */
  attachFile: (file: File | Blob, fileName?: string) => Promise<boolean>;
  attaching: boolean;
  attachError: string | null;
  dismissAttachError: () => void;
  removeAttachment: (id: string) => Promise<void>;
  load: () => Promise<void>;
  /** `false` quando não conseguiu enviar (o chamador devolve o texto ao campo). */
  send: (text: string) => Promise<boolean>;
  escalate: () => Promise<void>;
  reset: () => Promise<void>;
  dismissSendError: () => void;
}

export function useHelpThread(): UseHelpThread {
  const [messages, setMessages] = useState<HelpChatMessage[]>([]);
  const [thread, setThread] = useState<HelpThreadInfo | null>(null);
  const [status, setStatus] = useState<HelpLoadStatus>("idle");
  const [sending, setSending] = useState(false);
  const [shouldEscalate, setShouldEscalate] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [ticket, setTicket] = useState<HelpTicket | null>(null);
  const [proposedAction, setProposedAction] = useState<HelpProposedAction | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<HelpAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const loadingRef = useRef(false);
  /**
   * Toda escrita (enviar/escalar/recomeçar) incrementa este contador. Um GET que
   * começou ANTES de uma escrita não pode aplicar sua resposta velha por cima —
   * era assim que a bolha otimista sumia quando o lojista perguntava rápido.
   */
  const mutationsRef = useRef(0);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const startedAt = mutationsRef.current;
    setStatus((s) => (s === "ready" ? s : "loading"));
    try {
      const res = await fetch("/api/help/thread");
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as {
        data?: {
          thread: HelpThreadInfo;
          messages: HelpChatMessage[];
          pendingAttachments?: HelpAttachment[];
        };
      };
      if (!json.data) throw new Error("empty");
      if (mutationsRef.current !== startedAt) return; // chegou tarde demais
      setThread(json.data.thread);
      setMessages(json.data.messages ?? []);
      setPendingAttachments(json.data.pendingAttachments ?? []);
      setStatus("ready");
    } catch {
      setStatus((s) => (s === "ready" ? s : "error"));
    } finally {
      loadingRef.current = false;
    }
  }, []);

  // Enquanto a conversa está com a equipe humana, buscamos as respostas deles.
  useEffect(() => {
    if (thread?.mode !== "HUMAN") return;
    const id = setInterval(() => void load(), 12_000);
    return () => clearInterval(id);
  }, [thread?.mode, load]);

  const send = useCallback(
    async (text: string): Promise<boolean> => {
      const content = text.trim();
      const attachmentIds = pendingAttachments.map((a) => a.id);
      // Print sem legenda é mensagem válida — "a tela está assim" é a foto.
      if ((!content && !attachmentIds.length) || sending) return false;

      mutationsRef.current += 1;
      setSendError(null);
      setSending(true);

      const optimisticId = `tmp-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: optimisticId,
          role: "USER",
          content,
          authorName: null,
          createdAt: new Date().toISOString(),
          attachments: pendingAttachments,
        },
      ]);

      try {
        const res = await fetch("/api/help/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, attachmentIds }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as {
          data?: {
            threadId: string;
            mode: HelpThreadInfo["mode"];
            messages: HelpChatMessage[];
            assistant?: { shouldEscalate: boolean } | null;
            proposedAction?: HelpProposedAction | null;
          };
        };
        if (!json.data) throw new Error("empty");
        const data = json.data;
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimisticId),
          ...data.messages,
        ]);
        // Foram amarrados à mensagem — deixam de ser rascunho.
        setPendingAttachments([]);
        setThread((t) =>
          t ? { ...t, mode: data.mode } : { id: data.threadId, status: "OPEN", mode: data.mode },
        );
        setShouldEscalate(Boolean(data.assistant?.shouldEscalate));
        setProposedAction(data.proposedAction ?? null);
        setStatus("ready");
        return true;
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setSendError("Não consegui enviar sua mensagem. Verifique a conexão e tente de novo.");
        return false;
      } finally {
        setSending(false);
      }
    },
    [sending, pendingAttachments],
  );

  const attachFile = useCallback(
    async (file: File | Blob, fileName?: string): Promise<boolean> => {
      setAttaching(true);
      setAttachError(null);
      try {
        const form = new FormData();
        form.append("file", file, fileName ?? (file instanceof File ? file.name : "anexo"));
        const res = await fetch("/api/help/attachments", { method: "POST", body: form });
        const json = (await res.json().catch(() => ({}))) as {
          data?: HelpAttachment;
          error?: string;
        };
        if (!res.ok || !json.data) {
          // A recusa vem do servidor com a frase pronta — ela sabe o motivo
          // (tipo, tamanho, quantidade). Frase genérica aqui apagaria isso.
          setAttachError(
            json.error ?? "Não consegui anexar esse arquivo. Tente de novo.",
          );
          return false;
        }
        setPendingAttachments((prev) => [...prev, json.data!]);
        return true;
      } catch {
        setAttachError("Falha ao enviar o arquivo. Verifique a conexão e tente de novo.");
        return false;
      } finally {
        setAttaching(false);
      }
    },
    [],
  );

  const removeAttachment = useCallback(async (id: string) => {
    // Some da tela na hora; se o servidor recusar, ele volta.
    const backup = await new Promise<HelpAttachment[]>((resolve) => {
      setPendingAttachments((prev) => {
        resolve(prev);
        return prev.filter((a) => a.id !== id);
      });
    });
    try {
      const res = await fetch(`/api/help/attachments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setPendingAttachments(backup);
      setAttachError("Não consegui remover o anexo. Tente de novo.");
    }
  }, []);

  const dismissAttachError = useCallback(() => setAttachError(null), []);

  const escalate = useCallback(async () => {
    if (escalating) return;
    mutationsRef.current += 1;
    setEscalating(true);
    try {
      const res = await fetch("/api/help/escalate", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as {
        data?: {
          thread: HelpThreadInfo;
          message: HelpChatMessage;
          ticket: HelpTicket | null;
        };
      };
      if (!json.data) throw new Error("empty");
      setThread(json.data.thread);
      setMessages((prev) => [...prev, json.data!.message]);
      setTicket(json.data.ticket);
      setShouldEscalate(false);
      setProposedAction(null);
    } catch {
      setSendError("Não consegui abrir o chamado agora. Tente de novo em instantes.");
    } finally {
      setEscalating(false);
    }
  }, [escalating]);

  const reset = useCallback(async () => {
    if (resetting) return;
    mutationsRef.current += 1;
    setResetting(true);
    try {
      const res = await fetch("/api/help/reset", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as {
        data?: { thread: HelpThreadInfo; messages: HelpChatMessage[] };
      };
      if (!json.data) throw new Error("empty");
      setThread(json.data.thread);
      setMessages(json.data.messages ?? []);
      setPendingAttachments([]);
      setTicket(null);
      setShouldEscalate(false);
      setProposedAction(null);
      setSendError(null);
      setStatus("ready");
    } catch {
      setSendError("Não consegui iniciar uma conversa nova. Tente de novo.");
    } finally {
      setResetting(false);
    }
  }, [resetting]);

  const dismissSendError = useCallback(() => setSendError(null), []);

  return {
    messages,
    thread,
    status,
    sending,
    shouldEscalate,
    escalating,
    resetting,
    ticket,
    proposedAction,
    sendError,
    pendingAttachments,
    attachFile,
    attaching,
    attachError,
    dismissAttachError,
    removeAttachment,
    load,
    send,
    escalate,
    reset,
    dismissSendError,
  };
}
