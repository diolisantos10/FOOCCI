/**
 * Comercial → Central de Atendimento (tela 03 do desenho do CEO).
 *
 * ── POR QUE ESTA PÁGINA PASSOU A SER UMA CASCA ──────────────────────────────
 *
 * Ela montava, no servidor, o painel de supervisão que vivia aqui. O desenho 03
 * não pede painel: pede a MESA de três colunas, com a conversa aberta e o campo
 * de digitar. Mesa é tela que age, e tela que age é cliente — ela precisa
 * escolher caixa, trocar de conversa e registrar mensagem sem recarregar a
 * página no meio do atendimento.
 *
 * A visão de cima continua de pé, medida, em `/comercial/torre` (tela 02) e em
 * `/comercial/painel`. Nada de supervisão foi apagado; o que saiu daqui foi a
 * TERCEIRA cópia dela.
 *
 * ⚠️ A fechadura continua sendo desta página, e não da moldura. O layout de
 * `/comercial` exige sessão e **não** decide papel.
 */

import { Suspense } from "react";
import { lerSessaoInterna } from "@/lib/internal-auth";
import { CentralDeAtendimentoClient } from "./CentralDeAtendimentoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Central de Atendimento · Comercial" };

/**
 * Quem entra.
 *
 * ⭐ Mudou com o propósito da tela, e a mudança é deliberada. Enquanto isto era
 * um painel de carga do time, só o comando entrava — desempenho comparado de
 * colegas não é informação de fila. Virou mesa de trabalho: quem atende precisa
 * entrar, ou a tela do desenho fica sem o público dela.
 *
 * ⚠️ Abrir a porta **não** abre o dado: `escopoDaConsulta` prende o
 * `AGENTE_HUMANO` aos leads dele mais os que estão livres, no `where` da
 * consulta. A porta e o escopo são duas travas, e continuam sendo duas.
 */
const PAPEIS_DA_CENTRAL = new Set<string>([
  "MASTER_CEO",
  "DIRETOR_FOOCCI",
  "GERENTE_DEPARTAMENTO",
  "AGENTE_HUMANO",
  "AUDITOR_QA",
]);

function primeiro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? (valor[0] ?? "") : (valor ?? "")).trim();
}

export default async function CentralDeAtendimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string | string[] }>;
}) {
  const sessao = lerSessaoInterna();

  // O layout já barrou quem não tem sessão. Este `if` existe para o caso de a
  // página ser alcançada fora dela um dia — porta que depende da moldura é porta
  // destrancada.
  if (!sessao) {
    return (
      <p className="p-6 text-[13px] text-muted">Entre para ver a Central de Atendimento.</p>
    );
  }

  if (!PAPEIS_DA_CENTRAL.has(sessao.role)) {
    return (
      <div className="p-6">
        <p className="text-[13px] font-semibold text-ink">Esta tela não é do seu perfil.</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink2">
          A Central de Atendimento é a mesa de quem atende.
        </p>
      </div>
    );
  }

  const sp = await searchParams;

  return (
    <Suspense fallback={<p className="p-6 text-[13px] text-muted">Abrindo a Central…</p>}>
      <CentralDeAtendimentoClient leadInicial={primeiro(sp.leadId) || null} />
    </Suspense>
  );
}
