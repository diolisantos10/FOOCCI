/**
 * A ÁREA COMERCIAL — a casa de quem vende o Foocci.
 *
 * ── POR QUE ELA SAIU DE DENTRO DO ADMIN ─────────────────────────────────────
 *
 * Até 26/08/2026 esta área morava em `/admin/sala-de-vendas`, dentro da moldura
 * escura do Admin, com a barra lateral da empresa inteira ao lado. Funcionava, e
 * estava errado por duas razões que não são de estética:
 *
 *   · **O endereço ensina.** Uma pessoa cujo trabalho é atender cliente lendo
 *     `/admin` na barra do navegador aprende que está num lugar que não é dela —
 *     e a primeira coisa que ela vê do sistema é uma barra cheia de portas que
 *     devolvem 403.
 *   · **A moldura convida.** Ter Departamentos, Restaurantes e Qualidade a um
 *     clique de distância transforma "não alcança" em "tenta e descobre".
 *
 * Agora é `/comercial`: mesmo motor, mesmo banco, mesmas conversas — endereço
 * próprio e moldura própria. **Não** é `/atendimento`, que já é a caixa de
 * conversas do restaurante; a distinção não é de gosto, é de quem trabalha ali.
 * Aqui é a área de quem VENDE o Foocci, não a de quem o usa. **Nada foi duplicado**: os arquivos foram MOVIDOS,
 * não copiados. Uma segunda cópia da Sala seria a pior coisa que este repositório
 * poderia ganhar hoje.
 *
 * ── ⚠️ A MOLDURA NÃO É A FECHADURA ──────────────────────────────────────────
 *
 * Este layout exige uma sessão para desenhar a casa, e esconde a aba de quem não
 * pode abri-la. O que cada pessoa PODE fazer continua decidido rota a rota, no
 * servidor: quem digitar o endereço direto continua batendo na rota, que recusa.
 * A moldura é a casa; a fechadura está em cada porta.
 */

import { redirect } from "next/navigation";
import type { InternalRole } from "@prisma/client";
import { lerSessaoInterna } from "@/lib/internal-auth";
import { precisaTrocarSenha, ROTA_DA_TROCA } from "@/lib/troca-de-senha";
import { ENTRADA, menuDoComercial } from "@/lib/sala/rotas";
import { MolduraDaSala } from "./_moldura/MolduraDaSala";

export const metadata = {
  title: { default: "Comercial Foocci", template: "%s · Comercial Foocci" },
};

/**
 * O cargo como gente diz, e não como o banco grava.
 *
 * `GERENTE_DEPARTAMENTO` embaixo do próprio nome, na barra, é o sistema falando
 * a língua do sistema para quem só quer saber com que crachá está logado.
 */
const CARGO: Readonly<Record<InternalRole, string>> = {
  MASTER_CEO: "CEO",
  DIRETOR_FOOCCI: "Diretor Foocci",
  GERENTE_DEPARTAMENTO: "Gerente de departamento",
  AGENTE_HUMANO: "Vendedor / SDR",
  AUDITOR_QA: "Auditoria / QA",
  AGENTE_IA: "Agente de IA",
};

export default async function ComercialLayout({ children }: { children: React.ReactNode }) {
  const sessao = lerSessaoInterna();
  // ── ⚠️ UMA PORTA SÓ, E ELA TEM NOME ──────────────────────────────────────
  //
  // Antes eram duas: a sessão da pessoa **ou** a senha da casa. A senha da casa
  // abria a moldura — todos os menus — e as rotas de dentro a recusavam. Meia
  // porta.
  //
  // O CEO abriu e disse o que via: *"é uma tela sem nada, só com login e senha.
  // Não tem que aparecer os menus, nada."* Ele estava certo, e o defeito era
  // pior que estético: uma sala cheia de abas em que **nenhuma abre** ensina que
  // o sistema está quebrado. E era o contrário — o sistema estava recusando
  // corretamente alguém sem nome.
  //
  // Agora, sem sessão de pessoa, não há casa: há a tela de entrar.
  //
  // A porta de emergência não sumiu — ela mudou de lugar. `/comercial/acessos`
  // vive FORA desta moldura e continua aceitando a senha da casa, senão o
  // primeiro acesso da vida não teria por onde nascer.
  if (!sessao) {
    redirect(ENTRADA);
  }

  // ── ⛔⛔ QUEM ESTÁ COM SENHA DE TERCEIRO NÃO ENTRA NA SALA ────────────────
  //
  // A trava mora no LAYOUT pelo mesmo motivo estrutural da porta acima: é ele
  // quem renderiza `children`. Enquanto a troca não acontecer, a página nem
  // executa e nenhuma consulta dela toca o banco. Tela nova nasce protegida sem
  // ninguém lembrar de proteger — o oposto de uma guarda copiada arquivo a
  // arquivo, que só falta onde ninguém olhou.
  if (await precisaTrocarSenha(sessao.userId)) {
    redirect(ROTA_DA_TROCA);
  }

  // As listas de papéis NÃO atravessam para o navegador: o menu vai para o
  // componente de cliente já filtrado, e sem a régua que o filtrou.
  const menu = menuDoComercial(sessao.role).map((g) => ({
    rotulo: g.rotulo,
    href: g.href,
    abas: g.abas.map((a) => ({ href: a.href, rotulo: a.rotulo })),
    prefixos: g.prefixos,
  }));

  return (
    <MolduraDaSala menu={menu} nome={sessao.nome} cargo={CARGO[sessao.role] ?? sessao.role}>
      {children}
    </MolduraDaSala>
  );
}
