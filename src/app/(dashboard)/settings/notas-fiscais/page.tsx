"use client";

/**
 * Configurações → Notas Fiscais (NFC-e).
 *
 * A emissão pelo Foocci é OPCIONAL: o lojista que já emite no manager dele deixa
 * o botão desligado; quem quer emitir aqui liga, preenche os dados fiscais e o
 * token do gateway. Segredos (CSC, token) nunca voltam do servidor — os campos
 * mostram "salvo" e só são reenviados se você digitar um valor novo.
 */

import { useEffect, useState } from "react";
import { apiFetch, INPUT, SELECT, Field, Feedback, SaveButton, Toggle, PageCard, SectionHeading } from "../_shared";

interface FiscalView {
  exists: boolean;
  prefilledFromStore: boolean;
  enabled: boolean;
  provider: string;
  environment: string;
  regimeTributario: string;
  cnpj: string;
  inscricaoEstadual: string;
  inscricaoMunicipal: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnae: string;
  fiscalLogradouro: string;
  fiscalNumero: string;
  fiscalComplemento: string;
  fiscalBairro: string;
  fiscalMunicipio: string;
  fiscalMunicipioIbge: string;
  fiscalUf: string;
  fiscalCep: string;
  serie: number;
  proximoNumero: number;
  cscId: string;
  hasCscToken: boolean;
  hasProviderTokenHomologacao: boolean;
  hasProviderTokenProducao: boolean;
  defaultNcm: string;
  defaultCfop: string;
  defaultCsosn: string;
  defaultCst: string;
  defaultOrigem: string;
  defaultUnidade: string;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  missingForEmit: string[];
}

export default function NotasFiscaisPage() {
  const [v, setV] = useState<FiscalView | null>(null);
  const [secrets, setSecrets] = useState({ cscToken: "", providerTokenHomologacao: "", providerTokenProducao: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/api/settings/fiscal");
      if (res.ok) setV(res.data as FiscalView);
      setLoading(false);
    })();
  }, []);

  function upd<K extends keyof FiscalView>(k: K, val: FiscalView[K]) {
    setV((s) => (s ? { ...s, [k]: val } : s));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!v) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    const payload: Record<string, unknown> = {
      enabled: v.enabled,
      provider: v.provider,
      environment: v.environment,
      regimeTributario: v.regimeTributario,
      cnpj: v.cnpj,
      inscricaoEstadual: v.inscricaoEstadual,
      inscricaoMunicipal: v.inscricaoMunicipal,
      razaoSocial: v.razaoSocial,
      nomeFantasia: v.nomeFantasia,
      cnae: v.cnae,
      fiscalLogradouro: v.fiscalLogradouro,
      fiscalNumero: v.fiscalNumero,
      fiscalComplemento: v.fiscalComplemento,
      fiscalBairro: v.fiscalBairro,
      fiscalMunicipio: v.fiscalMunicipio,
      fiscalMunicipioIbge: v.fiscalMunicipioIbge,
      fiscalUf: v.fiscalUf,
      fiscalCep: v.fiscalCep,
      serie: v.serie,
      proximoNumero: v.proximoNumero,
      cscId: v.cscId,
      defaultNcm: v.defaultNcm,
      defaultCfop: v.defaultCfop,
      defaultCsosn: v.defaultCsosn,
      defaultCst: v.defaultCst,
      defaultOrigem: v.defaultOrigem,
      defaultUnidade: v.defaultUnidade,
    };
    // Secrets só vão quando digitados (em branco = mantém o salvo).
    if (secrets.cscToken) payload.cscToken = secrets.cscToken;
    if (secrets.providerTokenHomologacao) payload.providerTokenHomologacao = secrets.providerTokenHomologacao;
    if (secrets.providerTokenProducao) payload.providerTokenProducao = secrets.providerTokenProducao;

    const res = await apiFetch("/api/settings/fiscal", "PUT", payload);
    if (res.ok) {
      setV(res.data as FiscalView);
      setSecrets({ cscToken: "", providerTokenHomologacao: "", providerTokenProducao: "" });
      setSuccess("Configurações fiscais salvas.");
    } else {
      setError((res.data as { error?: string })?.error ?? "Erro ao salvar. Tente novamente.");
    }
    setSaving(false);
  }

  async function testConnection() {
    if (!v) return;
    setTesting(true);
    setTestMsg(null);
    const typed = v.environment === "PRODUCAO" ? secrets.providerTokenProducao : secrets.providerTokenHomologacao;
    const res = await apiFetch("/api/settings/fiscal/test-connection", "POST", {
      provider: v.provider === "DISABLED" ? "FOCUS_NFE" : v.provider,
      environment: v.environment,
      token: typed || undefined,
    });
    setTestMsg(res.ok ? (res.data as { ok: boolean; message: string }) : { ok: false, message: "Falha ao testar." });
    setTesting(false);
  }

  if (loading || !v) return <p className="py-8 text-sm text-muted">Carregando…</p>;

  const isProd = v.environment === "PRODUCAO";

  return (
    <form onSubmit={save} className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      {v.prefilledFromStore && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          Preenchemos o que deu com os dados da sua <strong>Loja</strong>. Confira, complete o que faltar
          (principalmente o <strong>código IBGE do município</strong>) e salve.
        </div>
      )}

      {/* Ativação */}
      <PageCard>
        <SectionHeading
          title="Emissão de nota fiscal (NFC-e)"
          subtitle="Opcional. Ligue só se você quer emitir a nota direto pelo Foocci. Se você já emite no seu sistema/manager, deixe desligado."
        />
        <div className="space-y-4">
          <Toggle
            label="Emitir NFC-e pelo Foocci"
            desc="Quando ligado, cada pedido gera a nota automaticamente após o pagamento."
            checked={v.enabled}
            onChange={(val) => upd("enabled", val)}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Emissor (gateway)" hint="Serviço homologado que assina e transmite a nota.">
              <select className={SELECT} value={v.provider} onChange={(e) => upd("provider", e.target.value)}>
                <option value="DISABLED">Desligado</option>
                <option value="FOCUS_NFE">Focus NFe</option>
              </select>
            </Field>
            <Field label="Ambiente" hint="Comece em Homologação (teste). Produção emite nota real.">
              <select className={SELECT} value={v.environment} onChange={(e) => upd("environment", e.target.value)}>
                <option value="HOMOLOGACAO">Homologação (teste)</option>
                <option value="PRODUCAO">Produção (nota real)</option>
              </select>
            </Field>
          </div>
          {isProd && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              ⚠️ <strong>Produção</strong> emite notas fiscais <strong>reais e válidas</strong> na SEFAZ. Só ative
              depois de validar tudo em homologação com o seu contador.
            </div>
          )}
        </div>
      </PageCard>

      {/* Pendências */}
      {v.enabled && v.missingForEmit.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Faltam dados para emitir:</p>
          <ul className="mt-1 list-inside list-disc">
            {v.missingForEmit.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Identidade */}
      <PageCard>
        <SectionHeading title="Dados da empresa" subtitle="Como o emitente aparece na nota." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="CNPJ">
            <input className={INPUT} value={v.cnpj} onChange={(e) => upd("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
          </Field>
          <Field label="Regime tributário">
            <select className={SELECT} value={v.regimeTributario} onChange={(e) => upd("regimeTributario", e.target.value)}>
              <option value="SIMPLES_NACIONAL">Simples Nacional</option>
              <option value="SIMPLES_EXCESSO">Simples Nacional — excesso de sublimite</option>
              <option value="REGIME_NORMAL">Regime Normal</option>
            </select>
          </Field>
          <Field label="Inscrição Estadual">
            <input className={INPUT} value={v.inscricaoEstadual} onChange={(e) => upd("inscricaoEstadual", e.target.value)} />
          </Field>
          <Field label="Inscrição Municipal" hint="Opcional.">
            <input className={INPUT} value={v.inscricaoMunicipal} onChange={(e) => upd("inscricaoMunicipal", e.target.value)} />
          </Field>
          <Field label="Razão social">
            <input className={INPUT} value={v.razaoSocial} onChange={(e) => upd("razaoSocial", e.target.value)} />
          </Field>
          <Field label="Nome fantasia" hint="Opcional.">
            <input className={INPUT} value={v.nomeFantasia} onChange={(e) => upd("nomeFantasia", e.target.value)} />
          </Field>
        </div>
      </PageCard>

      {/* Endereço fiscal */}
      <PageCard>
        <SectionHeading title="Endereço fiscal" subtitle="O código IBGE do município é obrigatório na NFC-e." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Logradouro">
            <input className={INPUT} value={v.fiscalLogradouro} onChange={(e) => upd("fiscalLogradouro", e.target.value)} />
          </Field>
          <Field label="Número">
            <input className={INPUT} value={v.fiscalNumero} onChange={(e) => upd("fiscalNumero", e.target.value)} />
          </Field>
          <Field label="Complemento" hint="Opcional.">
            <input className={INPUT} value={v.fiscalComplemento} onChange={(e) => upd("fiscalComplemento", e.target.value)} />
          </Field>
          <Field label="Bairro">
            <input className={INPUT} value={v.fiscalBairro} onChange={(e) => upd("fiscalBairro", e.target.value)} />
          </Field>
          <Field label="Município">
            <input className={INPUT} value={v.fiscalMunicipio} onChange={(e) => upd("fiscalMunicipio", e.target.value)} />
          </Field>
          <Field label="Código IBGE do município" hint="7 dígitos. Ex.: São Paulo = 3550308.">
            <input className={INPUT} value={v.fiscalMunicipioIbge} onChange={(e) => upd("fiscalMunicipioIbge", e.target.value)} placeholder="3550308" />
          </Field>
          <Field label="UF">
            <input className={INPUT} value={v.fiscalUf} onChange={(e) => upd("fiscalUf", e.target.value.toUpperCase())} placeholder="SP" maxLength={2} />
          </Field>
          <Field label="CEP">
            <input className={INPUT} value={v.fiscalCep} onChange={(e) => upd("fiscalCep", e.target.value)} placeholder="01000-000" />
          </Field>
        </div>
      </PageCard>

      {/* NFC-e / CSC */}
      <PageCard>
        <SectionHeading title="NFC-e e CSC" subtitle="Numeração e o Código de Segurança do Contribuinte (CSC), obtido no portal da SEFAZ do seu estado." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Série">
            <input type="number" min={1} className={INPUT} value={v.serie} onChange={(e) => upd("serie", Number(e.target.value) || 1)} />
          </Field>
          <Field label="Próximo número" hint="A nota atual sai com este número; incrementa sozinho.">
            <input type="number" min={1} className={INPUT} value={v.proximoNumero} onChange={(e) => upd("proximoNumero", Number(e.target.value) || 1)} />
          </Field>
          <Field label="ID do CSC (idToken)">
            <input className={INPUT} value={v.cscId} onChange={(e) => upd("cscId", e.target.value)} placeholder="000001" />
          </Field>
          <Field label="CSC (token)" hint={v.hasCscToken ? "Salvo. Deixe em branco para manter." : "Cole o CSC da SEFAZ."}>
            <input
              type="password"
              className={INPUT}
              value={secrets.cscToken}
              onChange={(e) => setSecrets((s) => ({ ...s, cscToken: e.target.value }))}
              placeholder={v.hasCscToken ? "•••••••• (salvo)" : ""}
            />
          </Field>
        </div>
      </PageCard>

      {/* Gateway */}
      <PageCard>
        <SectionHeading title="Conexão com o gateway" subtitle="Token da sua conta no Focus NFe. O certificado A1 fica lá; o Foocci só chama a API." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Token — Homologação" hint={v.hasProviderTokenHomologacao ? "Salvo. Deixe em branco para manter." : undefined}>
            <input
              type="password"
              className={INPUT}
              value={secrets.providerTokenHomologacao}
              onChange={(e) => setSecrets((s) => ({ ...s, providerTokenHomologacao: e.target.value }))}
              placeholder={v.hasProviderTokenHomologacao ? "•••••••• (salvo)" : ""}
            />
          </Field>
          <Field label="Token — Produção" hint={v.hasProviderTokenProducao ? "Salvo. Deixe em branco para manter." : undefined}>
            <input
              type="password"
              className={INPUT}
              value={secrets.providerTokenProducao}
              onChange={(e) => setSecrets((s) => ({ ...s, providerTokenProducao: e.target.value }))}
              placeholder={v.hasProviderTokenProducao ? "•••••••• (salvo)" : ""}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void testConnection()}
            disabled={testing}
            className="rounded-xl border border-line2 bg-paper px-4 py-2 text-sm font-medium text-ink2 hover:bg-[#FAFAF8] disabled:opacity-50 transition"
          >
            {testing ? "Testando…" : "🔌 Testar conexão"}
          </button>
          {testMsg && (
            <span className={`text-sm ${testMsg.ok ? "text-green-700" : "text-red-600"}`}>
              {testMsg.ok ? "✓ " : "✗ "}
              {testMsg.message}
            </span>
          )}
        </div>
        {v.lastTestedAt && (
          <p className="mt-2 text-xs text-muted">
            Último teste: {new Date(v.lastTestedAt).toLocaleString("pt-BR")} — {v.lastTestOk ? "OK" : "falhou"}
            {v.lastTestMessage ? ` (${v.lastTestMessage})` : ""}
          </p>
        )}
      </PageCard>

      {/* Defaults fiscais */}
      <PageCard>
        <SectionHeading
          title="Padrões fiscais dos produtos"
          subtitle="Valem quando o produto (ou a categoria) não define o seu próprio. Seu contador confirma esses códigos."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="NCM padrão" hint="Ex.: 21069090 (preparações alimentícias).">
            <input className={INPUT} value={v.defaultNcm} onChange={(e) => upd("defaultNcm", e.target.value)} placeholder="21069090" />
          </Field>
          <Field label="CFOP padrão" hint="Ex.: 5102.">
            <input className={INPUT} value={v.defaultCfop} onChange={(e) => upd("defaultCfop", e.target.value)} placeholder="5102" />
          </Field>
          {v.regimeTributario === "REGIME_NORMAL" ? (
            <Field label="CST padrão (ICMS)" hint="Regime normal. Ex.: 00.">
              <input className={INPUT} value={v.defaultCst} onChange={(e) => upd("defaultCst", e.target.value)} placeholder="00" />
            </Field>
          ) : (
            <Field label="CSOSN padrão" hint="Simples Nacional. Ex.: 102 ou 500.">
              <input className={INPUT} value={v.defaultCsosn} onChange={(e) => upd("defaultCsosn", e.target.value)} placeholder="102" />
            </Field>
          )}
          <Field label="Origem" hint="0 = nacional.">
            <input className={INPUT} value={v.defaultOrigem} onChange={(e) => upd("defaultOrigem", e.target.value)} placeholder="0" />
          </Field>
          <Field label="Unidade comercial" hint="Ex.: UN.">
            <input className={INPUT} value={v.defaultUnidade} onChange={(e) => upd("defaultUnidade", e.target.value)} placeholder="UN" />
          </Field>
        </div>
      </PageCard>

      <SaveButton saving={saving} label="Salvar configurações fiscais" />
    </form>
  );
}
