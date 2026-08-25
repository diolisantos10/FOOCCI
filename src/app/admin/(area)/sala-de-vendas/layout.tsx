/**
 * A navegação interna da Sala de Vendas.
 *
 * ── POR QUE ELA É SERVIDOR, E NÃO CLIENTE ───────────────────────────────────
 *
 * O item "Painel" só aparece para quem pode abri-lo. Decidir isso no cliente
 * exigiria mandar o papel para o navegador e confiar nele — e papel que viaja
 * para o cliente é papel que o cliente pode trocar.
 *
 * ⚠️ **Esconder o item NÃO é a autorização.** Quem digitar o endereço direto
 * continua batendo na rota, que recusa no servidor. Este menu é conveniência:
 * mostrar ao SDR uma porta que devolve 403 é ensinar que o sistema está quebrado.
 */

import Link from "next/link";
import { lerSessaoInterna } from "@/lib/internal-auth";

const PARA_TODOS = [
  { href: "/admin/sala-de-vendas", rotulo: "Filas" },
  { href: "/admin/sala-de-vendas/atendimento", rotulo: "Atendimento" },
  { href: "/admin/sala-de-vendas/funil", rotulo: "Funil" },
  // As fichas ficam visíveis para TODO MUNDO da Sala, o SDR incluído: elas dizem
  // o que cada função pode e não pode, e o SDR precisa ler a dele para saber
  // onde ele para e onde o Closer começa. Esconder a alçada a transforma em
  // folclore — e folclore se resolve perguntando ao colega mais antigo.
  { href: "/admin/sala-de-vendas/agentes", rotulo: "Agentes" },
  // Preço é dado PÚBLICO: está estampado no site para qualquer estranho ler.
  // Esconder do próprio vendedor não protegeria nada — só o obrigaria a caçar o
  // número na página de marketing no meio da conversa, ou a chutar.
  { href: "/admin/sala-de-vendas/precos", rotulo: "Preços" },
  // O ensaio do TA fica visível para a Sala inteira: quem vai trabalhar ao lado
  // dele precisa saber como ele fala e onde ele para. E a tela não envia nada —
  // não há o que proteger além do próprio Admin.
  { href: "/admin/sala-de-vendas/ensaio", rotulo: "Ensaio do TA" },
];

const PAPEIS_DO_PAINEL = new Set([
  "MASTER_CEO",
  "DIRETOR_FOOCCI",
  "GERENTE_DEPARTAMENTO",
  "AUDITOR_QA",
]);

/** Criar gente é do dono. O gerente distribui a fila; ele não cria acesso. */
const PAPEIS_DOS_ACESSOS = new Set(["MASTER_CEO", "DIRETOR_FOOCCI"]);

export default function SalaDeVendasLayout({ children }: { children: React.ReactNode }) {
  const sessao = lerSessaoInterna();

  // Sem sessão interna (a porta antiga do ADMIN_SECRET), mostramos tudo: a
  // recusa fina fica nas rotas, e esconder itens de quem entrou pela porta de
  // administração esconderia o produto de quem o está montando.
  const veOPainel = !sessao || PAPEIS_DO_PAINEL.has(sessao.role);
  const criaAcesso = !sessao || PAPEIS_DOS_ACESSOS.has(sessao.role);

  const itens = [
    ...PARA_TODOS,
    ...(veOPainel ? [{ href: "/admin/sala-de-vendas/painel", rotulo: "Painel" }] : []),
    ...(criaAcesso ? [{ href: "/admin/sala-de-vendas/acessos", rotulo: "Criar acesso" }] : []),
  ];

  return (
    <div className="flex min-h-full flex-col">
      <nav
        aria-label="Seções da Sala de Vendas"
        className="shrink-0 overflow-x-auto border-b border-line bg-paper"
      >
        <ul className="flex min-w-max gap-1 px-3 py-1.5">
          {itens.map((i) => (
            <li key={i.href}>
              <Link
                href={i.href}
                className="block rounded-lg px-3 py-1.5 text-[13px] font-semibold text-ink2 transition-colors hover:bg-canvas hover:text-ink"
              >
                {i.rotulo}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
