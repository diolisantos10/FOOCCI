/**
 * Root route.
 *
 * `foocci.com.br` é o SITE COMERCIAL — para todo mundo, sempre. Inclusive para
 * quem está com sessão de administrador/lojista aberta no navegador.
 *
 * ⚠️ NÃO volte a redirecionar sessão logada para `/dashboard` (defeito corrigido
 * em 23/08/2026, ordem do CEO). O que acontecia antes: quem trabalha no produto
 * fica permanentemente logado, então **ninguém da casa conseguia mais ver a
 * própria vitrine** — bastava digitar o domínio para cair no painel. Dois danos:
 * um defeito na página comercial deixava de ser notado por quem poderia notar, e
 * abrir o domínio numa reunião com a tela compartilhada expunha o painel interno
 * no lugar do site.
 *
 * O lojista NÃO perde o caminho: continua logado e a barra do topo do site mostra
 * "Ir para o painel" quando há sessão ativa (`PainelAtalho`, no layout de /site).
 * Um clique é conveniência; sequestrar a raiz é defeito.
 *
 * Por que redirect e não render: as páginas comerciais precisam do invólucro de
 * /site (header, footer, CTA fixo no celular) que vive em `site/(gated)/layout.tsx`.
 * `/site` é a URL canônica do marketing e é a que está indexada.
 *
 * `redirect()` lança por construção no App Router — mantenha-o fora de try/catch.
 */

import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/site");
}
