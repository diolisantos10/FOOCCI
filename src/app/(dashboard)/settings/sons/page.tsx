"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PageCard, SectionHeading, Toggle } from "../_shared";
import {
  SOUND_PREF_KEY,
  HANDOFF_SOUND_PREF_KEY,
  SOUND_LAST_PLAYED_KEY,
  HANDOFF_SOUND_LAST_PLAYED_KEY,
  SOUND_LAST_ERROR_KEY,
  HANDOFF_SOUND_LAST_ERROR_KEY,
  ORDER_ALERT_DIAG_KEY,
  ORDER_ALERT_ASSET,
  HANDOFF_ALERT_ASSET,
  writeSoundPref,
} from "@/lib/sound-prefs";
import { playAlertAudio } from "@/lib/sound-player";
import type { AlertLoopDiagnostics } from "@/lib/alert-loop";

// New-order alert uses the official Foocci order sound. The test button below
// plays THIS exact file through the same engine (playAlertAudio) as a real order.
const ORDER_WAV   = ORDER_ALERT_ASSET;
const HANDOFF_WAV = HANDOFF_ALERT_ASSET;

interface SoundSettings {
  soundEnabled:                     boolean;
  newOrderSoundEnabled:             boolean;
  humanAttentionSoundEnabled:       boolean;
  soundVolume:                      number;
  repeatNewOrderSoundUntilAccepted: boolean;
  repeatHumanAttentionUntilSeen:    boolean;
  soundTheme:                       "DEFAULT" | "SOFT" | "URGENT";
}

const DEFAULTS: SoundSettings = {
  soundEnabled:                     true,
  newOrderSoundEnabled:             true,
  humanAttentionSoundEnabled:       true,
  soundVolume:                      100,
  repeatNewOrderSoundUntilAccepted: true,
  repeatHumanAttentionUntilSeen:    true,
  soundTheme:                       "DEFAULT",
};

export default function SonsPage() {
  const [settings,     setSettings]     = useState<SoundSettings>(DEFAULTS);
  const [saved,        setSaved]        = useState<SoundSettings>(DEFAULTS);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [feedback,     setFeedback]     = useState<{ ok: boolean; msg: string } | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [testMsg,      setTestMsg]      = useState<string | null>(null);

  const orderAudioRef   = useRef<HTMLAudioElement | null>(null);
  const handoffAudioRef = useRef<HTMLAudioElement | null>(null);

  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  const [diag, setDiag] = useState<{
    orderLastPlayed:   string | null;
    handoffLastPlayed: string | null;
    orderLastError:    string | null;
    handoffLastError:  string | null;
    orderLoop:         (AlertLoopDiagnostics & { updatedAt?: string }) | null;
  } | null>(null);

  const refreshDiag = useCallback(() => {
    try {
      let orderLoop: (AlertLoopDiagnostics & { updatedAt?: string }) | null = null;
      const raw = localStorage.getItem(ORDER_ALERT_DIAG_KEY);
      if (raw) {
        try { orderLoop = JSON.parse(raw); } catch { orderLoop = null; }
      }
      setDiag({
        orderLastPlayed:   localStorage.getItem(SOUND_LAST_PLAYED_KEY),
        handoffLastPlayed: localStorage.getItem(HANDOFF_SOUND_LAST_PLAYED_KEY),
        orderLastError:    localStorage.getItem(SOUND_LAST_ERROR_KEY),
        handoffLastError:  localStorage.getItem(HANDOFF_SOUND_LAST_ERROR_KEY),
        orderLoop,
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    orderAudioRef.current   = new Audio(ORDER_WAV);
    handoffAudioRef.current = new Audio(HANDOFF_WAV);
    refreshDiag();

    fetch("/api/settings/sounds")
      .then((r) => r.json())
      .then((json: { data?: Partial<SoundSettings> }) => {
        if (json?.data && typeof json.data === "object") {
          const loaded = { ...DEFAULTS, ...json.data };
          setSettings(loaded);
          setSaved(loaded);
        }
      })
      .catch(() => { /* use defaults */ })
      .finally(() => setLoading(false));
  }, [refreshDiag]);

  function showFeedback(ok: boolean, msg: string) {
    setFeedback({ ok, msg });
    setTimeout(() => setFeedback(null), 5000);
  }

  function patch(partial: Partial<SoundSettings>) {
    setSettings((s) => ({ ...s, ...partial }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/sounds", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(settings),
      });
      const json: { data?: Partial<SoundSettings> } | null = await res.json().catch(() => null);
      if (res.ok && json?.data && typeof json.data === "object") {
        // Adopt the persisted values returned by the server, not the local draft
        const persisted = { ...DEFAULTS, ...json.data };
        setSettings(persisted);
        setSaved(persisted);
        // Mirror to localStorage so operational screens (OrdersClient, AtendimentoClient) pick up immediately
        writeSoundPref(SOUND_PREF_KEY,        persisted.soundEnabled && persisted.newOrderSoundEnabled);
        writeSoundPref(HANDOFF_SOUND_PREF_KEY, persisted.soundEnabled && persisted.humanAttentionSoundEnabled);
        showFeedback(true, "Configurações de som salvas.");
      } else {
        showFeedback(false, "Erro ao salvar. Tente novamente.");
      }
    } catch {
      showFeedback(false, "Sem conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setSettings(DEFAULTS);
  }

  async function testOrderSound() {
    const audio = orderAudioRef.current;
    if (!audio) return;
    try {
      await playAlertAudio(audio, 100); // volume travado em 100%
      try { localStorage.setItem(SOUND_LAST_PLAYED_KEY, new Date().toISOString()); } catch { /* ignore */ }
      setTestMsg("✓ Som de pedidos tocou com sucesso.");
      setAudioBlocked(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("NotAllowedError") || msg.includes("not allowed")) {
        setAudioBlocked(true);
        setTestMsg("Navegador bloqueou — clique em 'Desbloquear áudio neste dispositivo'.");
      } else {
        setTestMsg(`Erro: ${msg}`);
      }
      try { localStorage.setItem(SOUND_LAST_ERROR_KEY, `${new Date().toISOString()}: ${msg}`); } catch { /* ignore */ }
    } finally {
      refreshDiag();
      setTimeout(() => setTestMsg(null), 5000);
    }
  }

  async function testHandoffSound() {
    const audio = handoffAudioRef.current;
    if (!audio) return;
    try {
      await playAlertAudio(audio, 100); // volume travado em 100%
      try { localStorage.setItem(HANDOFF_SOUND_LAST_PLAYED_KEY, new Date().toISOString()); } catch { /* ignore */ }
      setTestMsg("✓ Som de atendimento tocou com sucesso.");
      setAudioBlocked(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("NotAllowedError") || msg.includes("not allowed")) {
        setAudioBlocked(true);
        setTestMsg("Navegador bloqueou — clique em 'Desbloquear áudio neste dispositivo'.");
      } else {
        setTestMsg(`Erro: ${msg}`);
      }
      try { localStorage.setItem(HANDOFF_SOUND_LAST_ERROR_KEY, `${new Date().toISOString()}: ${msg}`); } catch { /* ignore */ }
    } finally {
      refreshDiag();
      setTimeout(() => setTestMsg(null), 5000);
    }
  }

  function unlockAudio() {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      setAudioBlocked(false);
      setTestMsg("Áudio desbloqueado. Clique em Testar para confirmar.");
      setTimeout(() => setTestMsg(null), 4000);
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted">
        Carregando…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Unsaved changes banner */}
      {dirty && !feedback && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          As alterações só entram em vigor depois de salvar.
        </div>
      )}

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            feedback.ok
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.ok ? "✓ " : "✗ "}{feedback.msg}
        </div>
      )}

      {/* Test result message */}
      {testMsg && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {testMsg}
        </div>
      )}

      {/* Audio blocked warning */}
      {audioBlocked && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-700">🔇 Navegador bloqueou o áudio</p>
          <p className="mt-1 text-xs text-red-600">
            Por segurança, os navegadores bloqueiam áudio antes da primeira interação do usuário
            com a página. Clique no botão abaixo para autorizar.
          </p>
          <button
            type="button"
            onClick={unlockAudio}
            className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition"
          >
            🔊 Desbloquear áudio neste dispositivo
          </button>
        </div>
      )}

      {/* Master switch */}
      <PageCard>
        <SectionHeading
          title="Sons do restaurante"
          subtitle="Para o som funcionar, mantenha esta tela aberta no computador do restaurante e permita áudio no navegador."
        />
        <Toggle
          label="Ativar todos os sons"
          desc="Liga ou desliga todos os alertas sonoros do restaurante."
          checked={settings.soundEnabled}
          onChange={(v) => patch({ soundEnabled: v })}
        />
        <p className="mt-3 text-xs text-muted">
          Se o navegador bloquear o áudio, clique em &ldquo;Testar som&rdquo; uma vez neste computador para reautorizar.
        </p>
      </PageCard>

      {/* Volume — fixo em 100%, sem controle no app (use o volume do aparelho) */}
      <PageCard>
        <SectionHeading
          title="Volume"
          subtitle="O volume dos alertas é fixo em 100% — já toca alto e limpo. Para deixar mais alto ou mais baixo, use o controle de volume do próprio aparelho (celular ou computador)."
        />
        <div className="flex items-center gap-3 rounded-xl border border-line2 bg-[#FAFAF8] px-4 py-3">
          <span className="text-lg" aria-hidden>🔊</span>
          <p className="text-sm text-ink2">Volume fixo em <strong className="text-ink">100%</strong>.</p>
        </div>
      </PageCard>

      {/* New order sound */}
      <PageCard>
        <SectionHeading
          title="Som de novo pedido"
          subtitle="Toca quando um novo pedido PENDENTE chega na tela de Pedidos."
        />
        <div className="space-y-4">
          <Toggle
            label="Ativar som de novo pedido"
            desc="Alerta ao receber um novo pedido que aguarda aceite."
            checked={settings.soundEnabled && settings.newOrderSoundEnabled}
            onChange={(v) => patch({ newOrderSoundEnabled: v })}
          />
          <Toggle
            label="Repetir até pedido ser aceito"
            desc="Continua tocando em loop enquanto há pedido pendente sem aceite."
            checked={settings.repeatNewOrderSoundUntilAccepted}
            onChange={(v) => patch({ repeatNewOrderSoundUntilAccepted: v })}
          />
          <button
            type="button"
            onClick={() => void testOrderSound()}
            className="rounded-xl border border-line2 bg-paper px-4 py-2 text-sm font-medium text-ink2 hover:bg-[#FAFAF8] transition"
          >
            🔔 Testar som de pedido
          </button>
        </div>
      </PageCard>

      {/* Handoff sound */}
      <PageCard>
        <SectionHeading
          title="Som de atendimento humano"
          subtitle="Toca quando uma conversa entra em modo de atendimento humano."
        />
        <div className="space-y-4">
          <Toggle
            label="Ativar som de atendimento humano"
            desc="Alerta quando um cliente solicita atendimento humano ou é redirecionado pela IA."
            checked={settings.soundEnabled && settings.humanAttentionSoundEnabled}
            onChange={(v) => patch({ humanAttentionSoundEnabled: v })}
          />
          <Toggle
            label="Repetir até conversa ser vista"
            desc="Continua tocando enquanto há conversas em modo humano não visualizadas."
            checked={settings.repeatHumanAttentionUntilSeen}
            onChange={(v) => patch({ repeatHumanAttentionUntilSeen: v })}
          />
          <button
            type="button"
            onClick={() => void testHandoffSound()}
            className="rounded-xl border border-line2 bg-paper px-4 py-2 text-sm font-medium text-ink2 hover:bg-[#FAFAF8] transition"
          >
            🔔 Testar som de atendimento
          </button>
        </div>
      </PageCard>

      {/* Sound theme */}
      <PageCard>
        <SectionHeading
          title="Tema sonoro"
          subtitle="Afeta apenas o alerta de novo pedido. URGENTE toca mais alto e repete até o pedido ser aceito (ideal para cozinha)."
        />
        <div className="flex flex-wrap gap-3">
          {(["DEFAULT", "SOFT", "URGENT"] as const).map((theme) => (
            <button
              key={theme}
              type="button"
              onClick={() => patch({ soundTheme: theme })}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                settings.soundTheme === theme
                  ? "border-brand-400 bg-brand-50 text-brand-700"
                  : "border-line2 bg-paper text-ink2 hover:bg-[#FAFAF8]"
              }`}
            >
              {theme === "DEFAULT" ? "🔔 Padrão" : theme === "SOFT" ? "🎵 Suave" : "🚨 Urgente"}
            </button>
          ))}
        </div>
      </PageCard>

      {/* Save row — sticky footer */}
      <div className="sticky bottom-0 z-10 -mx-1 rounded-2xl border border-line bg-paper/95 px-6 py-4 shadow-lg backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="text-xs text-muted">
            {dirty
              ? "Você tem alterações não salvas."
              : "Todas as configurações estão salvas."}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-xl border border-line2 px-4 py-2 text-sm text-ink2 hover:bg-[#FAFAF8] transition"
            >
              Restaurar padrão
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !dirty}
              className="rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition"
            >
              {saving ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </div>
      </div>

      {/* Diagnostics */}
      <PageCard>
        <SectionHeading title="Diagnóstico" subtitle="Última atividade dos alertas neste dispositivo." />
        {diag ? (
          <div className="space-y-3 text-xs text-muted font-mono">
            {/* New-order alert loop */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Novo pedido (alerta)</p>
              <div><span className="font-semibold text-ink2">volume:</span> 100% (fixo)</div>
              <div><span className="font-semibold text-ink2">arquivo de áudio:</span> {diag.orderLoop?.assetPath ?? ORDER_WAV}</div>
              <div>
                <span className="font-semibold text-ink2">última tentativa:</span>{" "}
                {diag.orderLoop?.lastAttemptAt ? new Date(diag.orderLoop.lastAttemptAt).toLocaleString("pt-BR") : "—"}
              </div>
              <div><span className="font-semibold text-ink2">resultado:</span> {diag.orderLoop?.lastResult ?? "—"}{diag.orderLoop?.lastError ? ` (${diag.orderLoop.lastError})` : ""}</div>
              <div><span className="font-semibold text-ink2">loop ativo:</span> {diag.orderLoop ? (diag.orderLoop.loopActive ? "sim" : "não") : "—"}</div>
              <div><span className="font-semibold text-ink2">pedidos aguardando:</span> {diag.orderLoop?.activeCount ?? "—"}</div>
              <div><span className="font-semibold text-ink2">último motivo de parada:</span> {diag.orderLoop?.lastStopReason ?? "—"}</div>
            </div>
            {/* Last-played / last-error mirrors */}
            <div className="space-y-1.5 border-t border-line pt-3">
              <div><span className="font-semibold text-ink2">pedido · último toque:</span> {diag.orderLastPlayed ?? "—"}</div>
              <div><span className="font-semibold text-ink2">pedido · último erro:</span> {diag.orderLastError ?? "—"}</div>
              <div><span className="font-semibold text-ink2">atendimento · último toque:</span> {diag.handoffLastPlayed ?? "—"}</div>
              <div><span className="font-semibold text-ink2">atendimento · último erro:</span> {diag.handoffLastError ?? "—"}</div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted">Carregando…</p>
        )}
        <button
          type="button"
          onClick={refreshDiag}
          className="mt-4 rounded-xl border border-line2 px-3 py-1.5 text-xs text-muted hover:bg-[#FAFAF8] transition"
        >
          Atualizar
        </button>
      </PageCard>

      {/* Help note */}
      <PageCard>
        <SectionHeading title="Sobre o áudio no navegador" />
        <p className="text-sm text-ink2">
          Navegadores modernos bloqueiam o áudio automático até o usuário interagir com a página.
          Se os sons pararem de funcionar após recarregar, use os botões <strong>Testar</strong>{" "}
          acima para reautorizar. Esta é a única tela que controla os sons — as telas de Pedidos
          e Atendimento apenas tocam os alertas conforme configurado aqui.
        </p>
      </PageCard>
    </div>
  );
}
