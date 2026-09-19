"use client";

/**
 * O FORMULÁRIO DO CADASTRO À MÃO.
 *
 * ── AS TRÊS REGRAS QUE ESTA TELA NÃO PODE QUEBRAR ───────────────────────────
 *
 * 1. **Ela não escreve no banco.** Manda um POST para
 *    `/api/admin/sala-de-vendas/cadastrar-lead`, que chama a porta única do
 *    nascimento do lead. Nenhuma tela desta casa escreve em `SiteLead`.
 * 2. **Ela não dispara mensagem**, e diz isso na própria tela — o disparo está
 *    pausado por ordem do CEO, e quem cadastra precisa saber que cadastrar não
 *    é falar com a pessoa.
 * 3. **Ela nunca devolve um "ok" mudo.** Depois de salvar, a tela diz qual dos
 *    dois casos aconteceu — ficha nova ou pessoa que já estava na base e foi
 *    promovida — com o link para a conversa dela. Um "salvo com sucesso" sem
 *    dizer o que foi salvo é como um lead duplicado nasce sem ninguém ver.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ROTAS } from "@/lib/sala/rotas";
import {
  ORIGENS_DO_CADASTRO_A_MAO,
  type CadastroAMaoInput,
} from "@/services/leads/cadastrarLeadAMao";
import { Cabecalho, TituloDaPagina } from "../_pecas/Pecas";

type Resultado =
  | { status: "criado"; leadId: string; codigo: string | null; fonte: string }
  | {
      status: "promovido";
      leadId: string;
      codigo: string | null;
      fonte: string;
      fonteAnterior: string;
      virouLead: boolean;
    };

const VAZIO = {
  nome: "",
  whatsapp: "",
  email: "",
  restaurante: "",
  cidade: "",
  origem: "",
  comoNosConheceu: "",
  campanha: "",
};

type Campos = typeof VAZIO;

function Campo({
  rotulo,
  nome,
  valor,
  aoMudar,
  obrigatorio,
  ajuda,
  tipo = "text",
  placeholder,
}: {
  rotulo: string;
  nome: keyof Campos;
  valor: string;
  aoMudar: (nome: keyof Campos, v: string) => void;
  obrigatorio?: boolean;
  ajuda?: string;
  tipo?: string;
  placeholder?: string;
}) {
  const id = `campo-${nome}`;
  return (
    <label htmlFor={id} className="block">
      <span className="block text-[12.5px] font-semibold text-ink">
        {rotulo}
        {obrigatorio ? <span className="text-rose-600"> *</span> : null}
      </span>
      <input
        id={id}
        name={nome}
        type={tipo}
        value={valor}
        required={obrigatorio}
        placeholder={placeholder}
        onChange={(e) => aoMudar(nome, e.target.value)}
        className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2 text-[13.5px] text-ink outline-none transition-colors placeholder:text-muted focus:border-emerald-500"
      />
      {ajuda ? <span className="mt-1 block text-[11.5px] leading-snug text-muted">{ajuda}</span> : null}
    </label>
  );
}

export function CadastrarLeadClient() {
  const [campos, setCampos] = useState<Campos>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const origemEscolhida = useMemo(
    () => ORIGENS_DO_CADASTRO_A_MAO.find((o) => o.valor === campos.origem) ?? null,
    [campos.origem],
  );

  function mudar(nome: keyof Campos, v: string) {
    setCampos((c) => ({ ...c, [nome]: v }));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErro(null);
    setResultado(null);

    try {
      const r = await fetch("/api/admin/sala-de-vendas/cadastrar-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campos as unknown as CadastroAMaoInput),
      });
      const corpo = await r.json().catch(() => null);

      if (!r.ok || !corpo?.ok) {
        setErro(corpo?.error ?? "Não deu para cadastrar. O lead NÃO foi salvo.");
        return;
      }

      setResultado(corpo.resultado as Resultado);
      // A ficha some da tela só depois de a resposta dizer o que aconteceu —
      // limpar antes faria um erro de rede apagar o que a pessoa digitou.
      setCampos(VAZIO);
    } catch {
      setErro("A rede falhou no meio do caminho. O lead NÃO foi salvo — tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
      <TituloDaPagina
        contexto="Leads"
        titulo="Cadastrar lead à mão"
        subtitulo="A porta de emergência do nascimento do lead: quando a planilha, o webhook ou a campanha falharem, o lead entra por aqui — e entra pela mesma recepção de sempre, sem virar ficha duplicada."
      />

      {/* ⛔ A regra do CEO, escrita onde ela é lida: cadastrar não é falar. */}
      <p className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-[12.5px] leading-relaxed text-ink2">
        <strong className="text-ink">Cadastrar não dispara mensagem.</strong> O envio está
        pausado por ordem do CEO e esta tela não o aciona. O lead entra na base, ganha
        relógio de primeira resposta e aparece nas filas — quem fala com ele é gente, na
        tela de Conversas.
      </p>

      {resultado ? (
        <div
          className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-[13px] leading-relaxed text-ink2"
          role="status"
        >
          {resultado.status === "criado" ? (
            <p>
              <strong className="text-ink">Lead criado.</strong> Ficha nova na base, com
              origem <code className="text-ink">{resultado.fonte}</code>
              {resultado.codigo ? (
                <>
                  {" "}
                  e código <strong className="text-ink">{resultado.codigo}</strong>
                </>
              ) : null}
              .
            </p>
          ) : (
            <p>
              <strong className="text-ink">Esta pessoa já estava na base</strong>
              {resultado.virouLead
                ? " e foi promovida a lead agora — o histórico dela foi preservado inteiro."
                : " e a ficha dela foi completada — nenhuma segunda ficha foi criada."}{" "}
              Origem antes: <code className="text-ink">{resultado.fonteAnterior}</code>; agora:{" "}
              <code className="text-ink">{resultado.fonte}</code>.
            </p>
          )}
          <Link
            href={`${ROTAS.conversas}?leadId=${encodeURIComponent(resultado.leadId)}`}
            className="mt-2 inline-block font-semibold text-emerald-700 underline underline-offset-2"
          >
            Abrir a conversa desta pessoa →
          </Link>
        </div>
      ) : null}

      {erro ? (
        <p
          className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] leading-relaxed text-ink2"
          role="alert"
        >
          <strong className="text-ink">Não cadastrou.</strong> {erro}
        </p>
      ) : null}

      <form onSubmit={enviar} className="space-y-5">
        <section className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
          <Cabecalho
            titulo="Quem é a pessoa"
            subtitulo="Nome e WhatsApp bastam para o lead existir. O resto qualifica."
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Campo
              rotulo="Nome"
              nome="nome"
              valor={campos.nome}
              aoMudar={mudar}
              obrigatorio
              placeholder="Elisa Oliveira"
            />
            <Campo
              rotulo="WhatsApp"
              nome="whatsapp"
              valor={campos.whatsapp}
              aoMudar={mudar}
              obrigatorio
              tipo="tel"
              placeholder="(11) 96954-5259"
              ajuda="Se este número já estiver na base, a pessoa NÃO é duplicada: a ficha dela é promovida e o histórico fica."
            />
            <Campo
              rotulo="E-mail"
              nome="email"
              valor={campos.email}
              aoMudar={mudar}
              tipo="email"
              placeholder="elisa@restaurante.com.br"
            />
            <Campo
              rotulo="Nome do restaurante"
              nome="restaurante"
              valor={campos.restaurante}
              aoMudar={mudar}
              placeholder="Sushi da Elisa"
            />
            <Campo
              rotulo="Cidade"
              nome="cidade"
              valor={campos.cidade}
              aoMudar={mudar}
              placeholder="São Paulo — SP"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
          <Cabecalho
            titulo="De onde ela veio"
            subtitulo="O campo mais caro desta tela: é ele que decide se a pessoa é lead de campanha ou base fria — e, depois, que tratamento ela recebe."
          />
          <div className="mt-4 space-y-4">
            <label htmlFor="campo-origem" className="block">
              <span className="block text-[12.5px] font-semibold text-ink">
                Origem<span className="text-rose-600"> *</span>
              </span>
              <select
                id="campo-origem"
                name="origem"
                value={campos.origem}
                required
                onChange={(e) => mudar("origem", e.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2 text-[13.5px] text-ink outline-none transition-colors focus:border-emerald-500"
              >
                {/* Sem opção pré-selecionada, de propósito: um padrão silencioso
                    faria o vendedor apressado carimbar a origem errada sem
                    nunca ter decidido nada. */}
                <option value="">Escolha a origem…</option>
                {ORIGENS_DO_CADASTRO_A_MAO.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11.5px] leading-snug text-muted">
                {origemEscolhida
                  ? origemEscolhida.explicacao
                  : "Um lead vindo de campanha é lead de campanha, nunca base fria — a diferença decide qual mensagem ele recebe depois."}
              </span>
            </label>

            <Campo
              rotulo="Como nos conheceu?"
              nome="comoNosConheceu"
              valor={campos.comoNosConheceu}
              aoMudar={mudar}
              placeholder="Viu o anúncio no Instagram e chamou no direct"
              ajuda="Vai para a trilha da ficha e para o campo Origem do CRM 360. Não existe coluna própria para isto hoje — está escrito onde dá para ler, e não prometido."
            />

            <Campo
              rotulo="Campanha"
              nome="campanha"
              valor={campos.campanha}
              aoMudar={mudar}
              placeholder="Foocci | Leads | Donos de Restaurantes | 09-2026"
              ajuda="Só quando houver. É o que liga este lead ao anúncio que o trouxe."
            />
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={salvando}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {salvando ? "Cadastrando…" : "Cadastrar lead"}
          </button>
          <span className="text-[11.5px] text-muted">
            O lead entra pela mesma recepção do lead da campanha — nunca direto no banco.
          </span>
        </div>
      </form>
    </div>
  );
}
