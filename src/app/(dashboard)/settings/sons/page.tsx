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
  writeSoundPref,
} from "@/lib/sound-prefs";
import { playAlertAudio, supportsVolumeBoost, MAX_VOLUME } from "@/lib/sound-player";

const ORDER_WAV   = "/sounds/foocci-order-alert.m4a";
const HANDOFF_WAV = "/sounds/foocci-handoff-alert.wav";

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
  soundVolume:                      120,
  repeatNewOrderSoundUntilAccepted: false,
  repeatHumanAttentionUntilSeen:    false,
  soundTheme:                       "DEFAULT",
};

// >100% uses Web Audio gain boost (see sound-player.ts)
const VOLUME_PRESETS: { label: string; value: number; hint?: string }[] = [
  { label: "Baixo (50%)",   value: 50 },
  { label: "Normal (100%)", value: 100 },
  { label: "Alto (150%)",   value: 150, hint: "Para restaurantes barulhentos" },
  { label: "Máximo (200%)", value: 200, hint: "Para restaurantes barulhentos" },
];

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
  const [boostOk, setBoostOk] = useState(true);

  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);
  const volumeMax = boostOk ? MAX_VOLUME : 100;

  const [diag, setDiag] = useState<{
    orderLastPlayed:   string | null;
    handoffLastPlayed: string | null;
    orderLastError:    string | null;
    handoffLastError:  string | null;
  } | null>(null);

  const refreshDiag = useCallback(() => {
    try {
      setDiag({
        orderLastPlayed:   localStorage.getItem(SOUND_LAST_PLAYED_KEY),
        handoffLastPlayed: localStorage.getItem(HANDOFF_SOUND_LAST_PLAYED_KEY),
        orderLastError:    localStorage.getItem(SOUND_LAST_ERROR_KEY),
        handoffLastError:  localStorage.getItem(HANDOFF_SOUND_LAST_ERROR_KEY),
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    orderAudioRef.current   = new Audio(ORDER_WAV);
    handoffAudioRef.current = new Audio(HANDOFF_WAV);
    setBoostOk(supportsVolumeBoost());
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
      await playAlertAudio(audio, settings.soundVolume);
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
      await playAlertAudio(audio, settings.soundVolume);
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
      <div className="flex items-center justify-center py-16 text-sm text-gray-400">
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
        <p className="mt-3 text-xs text-gray-400">
          Se o navegador bloquear o áudio, clique em &ldquo;Testar som&rdquo; uma vez neste computador para reautorizar.
        </p>
      </PageCard>

      {/* Volume */}
      <PageCard>
        <SectionHeading
          title="Volume"
          subtitle="Ajusta o volume de todos os alertas. Acima de 100% o som é reforçado digitalmente."
        />
        <div className="space-y-4">
          {/* Slider */}
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-400 shrink-0 w-6">0%</span>
            <input
              type="range"
              min={0}
              max={volumeMax}
              value={Math.min(settings.soundVolume, volumeMax)}
              disabled={!settings.soundEnabled}
              onChange={(e) => patch({ soundVolume: Number(e.target.value) })}
              className="h-2 w-full cursor-pointer accent-orange-500 disabled:opacity-40"
            />
            <span className="w-12 shrink-0 text-right text-sm font-bold text-gray-800">
              {settings.soundVolume}%
            </span>
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            {VOLUME_PRESETS.filter((p) => p.value <= volumeMax).map((p) => (
              <button
                key={p.value}
                type="button"
                disabled={!settings.soundEnabled}
                onClick={() => patch({ soundVolume: p.value })}
                title={p.hint}
                className={`rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                  settings.soundVolume === p.value
                    ? "border-orange-400 bg-orange-50 text-orange-700"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <p className="text-xs text-gray-400">
            Para restaurantes barulhentos, use <strong className="text-gray-600">Alto (150%)</strong> ou{" "}
            <strong className="text-gray-600">Máximo (200%)</strong>. Recomendado: 120%.
          </p>
          {!boostOk && (
            <p className="text-xs text-amber-600">
              Volume reforçado (acima de 100%) não disponível neste navegador.
            </p>
          )}
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
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
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
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            🔔 Testar som de atendimento
          </button>
        </div>
      </PageCard>

      {/* Sound theme */}
      <PageCard>
        <SectionHeading title="Tema sonoro" subtitle="Escolha o tipo de alerta." />
        <div className="flex flex-wrap gap-3">
          {(["DEFAULT", "SOFT", "URGENT"] as const).map((theme) => (
            <button
              key={theme}
              type="button"
              onClick={() => patch({ soundTheme: theme })}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                settings.soundTheme === theme
                  ? "border-orange-400 bg-orange-50 text-orange-700"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {theme === "DEFAULT" ? "🔔 Padrão" : theme === "SOFT" ? "🎵 Suave" : "🚨 Urgente"}
            </button>
          ))}
        </div>
      </PageCard>

      {/* Save row — sticky footer */}
      <div className="sticky bottom-0 z-10 -mx-1 rounded-2xl border border-gray-100 bg-white/95 px-6 py-4 shadow-lg backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="text-xs text-gray-500">
            {dirty
              ? "Você tem alterações não salvas."
              : "Todas as configurações estão salvas."}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition"
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
          <div className="space-y-1.5 text-xs text-gray-500 font-mono">
            <div><span className="font-semibold text-gray-700">pedido · último toque:</span> {diag.orderLastPlayed ?? "—"}</div>
            <div><span className="font-semibold text-gray-700">pedido · último erro:</span> {diag.orderLastError ?? "—"}</div>
            <div><span className="font-semibold text-gray-700">atendimento · último toque:</span> {diag.handoffLastPlayed ?? "—"}</div>
            <div><span className="font-semibold text-gray-700">atendimento · último erro:</span> {diag.handoffLastError ?? "—"}</div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">Carregando…</p>
        )}
        <button
          type="button"
          onClick={refreshDiag}
          className="mt-4 rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition"
        >
          Atualizar
        </button>
      </PageCard>

      {/* Help note */}
      <PageCard>
        <SectionHeading title="Sobre o áudio no navegador" />
        <p className="text-sm text-gray-600">
          Navegadores modernos bloqueiam o áudio automático até o usuário interagir com a página.
          Se os sons pararem de funcionar após recarregar, use os botões <strong>Testar</strong>{" "}
          acima para reautorizar. Esta é a única tela que controla os sons — as telas de Pedidos
          e Atendimento apenas tocam os alertas conforme configurado aqui.
        </p>
      </PageCard>
    </div>
  );
}
