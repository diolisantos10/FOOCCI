/**
 * O TIME DE AGENTES — o que não pode mudar sem alguém perceber.
 *
 * ── O QUE ESTES CASOS GUARDAM ───────────────────────────────────────────────
 *
 * A lista parece boba demais para ter teste: são cinco linhas de dado. Mas cada
 * campo aqui alimenta uma criação de conta com um clique, e três dos erros
 * possíveis são **silenciosos** — a tela mostra "acesso criado" e o estrago só
 * aparece dias depois:
 *
 *  · dois agentes com o mesmo e-mail → o segundo clique **troca a senha do
 *    primeiro** em vez de criar alguém novo. A rota é a mesma para criar e para
 *    trocar, e ela não tem como saber que foi engano;
 *  · o papel errado → a conta nasce, entra, e não enxerga a tela de conversa;
 *  · nome de gente → o lead lê "Ana assumiu seu atendimento", descobre depois o
 *    que Ana é, e passa a duvidar de tudo que Ana disse antes.
 *
 * Nenhum destes três quebra nada na hora. É por isso que estão aqui.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TIME_DE_AGENTES,
  PAPEL_DO_TIME,
  DEPARTAMENTOS_DO_TIME,
  agentePorSlug,
} from "./timeDeAgentes";
import { abasDoComercial } from "@/lib/sala/rotas";

/**
 * O código sem os comentários.
 *
 * Existe por causa de um erro real: um teste que varre a fonte procurando
 * `randomBytes` encontra a frase "este arquivo não tem `randomBytes`" e reprova
 * o arquivo justamente por ele explicar que está correto.
 *
 * Não é um parser — uma `//` dentro de uma string literal seria cortada por
 * engano. Para o que estes casos medem (imports e atribuições em rotas curtas)
 * isso basta, e a alternativa seria carregar um analisador para ler três linhas.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function fonteDaRotaDoTime(): string {
  return semComentarios(
    readFileSync(
      join(process.cwd(), "src/app/api/admin/sala-de-vendas/time-de-agentes/route.ts"),
      "utf8",
    ),
  );
}

describe("o time vem pronto", () => {
  it("⭐ tem cinco agentes já nomeados", () => {
    // O pedido do CEO, com estas letras: *"você já tem que nomear uns cinco,
    // já, já prontos"*. O número é dele, não é estético — e a tela que cria um
    // por clique deixa quem olha a fila escolher quantos entram hoje.
    expect(TIME_DE_AGENTES).toHaveLength(5);
  });

  it("todos têm nome, e-mail e função preenchidos", () => {
    for (const a of TIME_DE_AGENTES) {
      expect(a.slug.trim(), `slug vazio em ${a.nome}`).not.toBe("");
      expect(a.nome.trim(), `nome vazio em ${a.slug}`).not.toBe("");
      expect(a.email, `e-mail inválido em ${a.slug}`).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
      // Sem a função, cinco botões viram cinco botões idênticos e quem clica
      // não tem como escolher qual.
      expect(a.funcao.trim().length, `função vazia em ${a.slug}`).toBeGreaterThan(10);
    }
  });

  it("⭐ nenhum e-mail se repete — repetir troca a senha de quem já existe", () => {
    // O defeito silencioso. A rota de primeiro acesso usa o e-mail como
    // identidade: o segundo clique no mesmo e-mail não recusa, ele TROCA a
    // senha do primeiro. Dois agentes iguais na lista derrubariam um do outro
    // sem mensagem de erro nenhuma.
    const emails = TIME_DE_AGENTES.map((a) => a.email.toLowerCase());
    expect(new Set(emails).size, `e-mail repetido em: ${emails.join(", ")}`).toBe(emails.length);
  });

  it("nenhum slug se repete — a tela usa o slug como chave", () => {
    const slugs = TIME_DE_AGENTES.map((a) => a.slug);
    expect(new Set(slugs).size, `slug repetido em: ${slugs.join(", ")}`).toBe(slugs.length);
  });
});

describe("⭐ agente não se passa por gente", () => {
  it("os nomes são numerados, não são nomes de pessoa", () => {
    // A tentação é Ana, Bruno, Carla — e sairia caro. O nome aparece na
    // conversa e na trilha de "quem assumiu". Quem tem nome de gente aqui é
    // gente.
    for (const a of TIME_DE_AGENTES) {
      expect(a.nome, `${a.slug} tem nome que parece de pessoa`).toMatch(/^Agente \d+$/);
    }
  });

  it("o domínio dos agentes é separado do domínio das pessoas", () => {
    // Se o agente morasse em @foocci.com.br, um dia um e-mail de agente
    // colidiria com o de um funcionário de verdade — e a colisão troca a senha
    // da pessoa, não a do agente.
    for (const a of TIME_DE_AGENTES) {
      expect(a.email.endsWith("@agentes.foocci.com.br"), `${a.slug} fora do domínio`).toBe(true);
    }
  });
});

describe("⭐ agente não faz login", () => {
  it("o papel é AGENTE_IA", () => {
    // ⚠️ A primeira versão deste arquivo afirmava o CONTRÁRIO — que o papel
    // tinha de ser AGENTE_HUMANO "porque o agente usa as telas". A premissa
    // estava errada, e o CEO corrigiu: *"os agentes de IA, eles não têm login,
    // eles estão lá no sistema"*.
    //
    // O papel é o que faz isso valer: `autenticarInterno` recusa AGENTE_IA
    // mesmo com hash gravado no banco. Trocar esta linha por AGENTE_HUMANO
    // devolveria a capacidade de login a cinco contas que ninguém usa.
    expect(PAPEL_DO_TIME).toBe("AGENTE_IA");
  });

  it("⭐ e a recusa é do código, não deste teste", () => {
    // A prova que importa: o portão do login existe e barra este papel. Sem
    // este caso, `PAPEL_DO_TIME` seria só uma etiqueta que eu escolhi — e uma
    // etiqueta não impede ninguém de entrar.
    //
    // Guardrail 4: prompt é aviso, código é trava.
    const fonte = readFileSync(
      join(process.cwd(), "src/lib/internal-auth.ts"),
      "utf8",
    );
    expect(
      fonte.includes(`user.role === "${PAPEL_DO_TIME}"`),
      "internal-auth.ts não barra mais o papel do time — o agente voltou a poder entrar",
    ).toBe(true);
  });

  it("a rota do time não gera senha, e não é a rota de gente", () => {
    // A separação é estrutural: `primeiro-acesso` sorteia senha e a devolve na
    // resposta. Se o time passasse por lá, o agente ganharia credencial de
    // volta — e nada na tela mostraria isso.
    //
    // ⚠️ Lê o CÓDIGO, não os comentários. A primeira versão deste caso falhou
    // contra a própria explicação do arquivo, que cita `randomBytes` para dizer
    // que ele não está lá. Um teste que lê prosa mede a prosa.
    expect(fonteDaRotaDoTime(), "a rota do time passou a gerar senha").not.toMatch(
      /randomBytes|bcryptjs|passwordHash/,
    );
  });

  it("⭐ e nem quem garante o time no sistema escreve senha", () => {
    // A rota ficou limpa, mas o trabalho mudou de arquivo: quem cria os
    // registros agora é `garantirTime.ts`. Sem este caso, a trava anterior
    // continuaria passando enquanto a senha voltava pela porta nova.
    const codigo = semComentarios(
      readFileSync(join(process.cwd(), "src/services/salaDeVendas/garantirTime.ts"), "utf8"),
    );
    expect(codigo, "garantirTime passou a gravar senha").not.toMatch(
      /randomBytes|bcryptjs|passwordHash/,
    );
  });

  it("⭐ e a rota de GENTE continua recusando este papel", () => {
    // A outra metade. Não basta a rota do time ser limpa: se `primeiro-acesso`
    // aceitasse AGENTE_IA, bastaria um POST com o papel no corpo para criar um
    // agente COM senha, por fora da tela.
    const fonte = readFileSync(
      join(process.cwd(), "src/app/api/admin/sala-de-vendas/primeiro-acesso/route.ts"),
      "utf8",
    );
    const lista = fonte.slice(fonte.indexOf("const PAPEIS"), fonte.indexOf("const EMAIL"));
    expect(
      lista.includes(PAPEL_DO_TIME),
      "primeiro-acesso passou a aceitar AGENTE_IA — agente com senha de novo",
    ).toBe(false);
  });

  it("trabalha em vendas, e só", () => {
    expect(DEPARTAMENTOS_DO_TIME).toEqual(["vendas"]);
  });
});

describe("⭐ o agente já é parte do sistema — não se admite", () => {
  it("a rota do time não tem POST", () => {
    // A terceira correção do CEO no mesmo dia, e a que resolve a premissa:
    // *"os agentes já são parte do sistema. Eles não são externos... os humanos
    // é que vão ter que fazer login e entrar no sistema"*.
    //
    // Eu tinha corrigido o sintoma duas vezes — tirei a senha, mantive o botão
    // — e continuei tratando o agente como quem chega de fora e precisa ser
    // admitido. A ausência do POST é a premissa nova escrita em código.
    expect(
      fonteDaRotaDoTime(),
      "a rota do time voltou a ter POST — agente virou coisa que se admite",
    ).not.toMatch(/export\s+async\s+function\s+POST/);
  });

  it("e a tela de acessos não fala mais em pôr agente no sistema", () => {
    // A tela é de GENTE. Um botão de agente aqui traz de volta a ideia de que
    // ele está do lado de fora esperando.
    const tela = semComentarios(
      readFileSync(
        join(process.cwd(), "src/app/comercial/(area)/acessos/AcessosClient.tsx"),
        "utf8",
      ),
    );
    expect(tela, "a tela de acessos voltou a admitir agente").not.toMatch(
      /P[oô]r no sistema|TIME_DE_AGENTES/,
    );
  });

  it("⭐ mas o time continua existindo — quem garante é garantirTime", () => {
    // A outra metade, e a que impede a leitura errada desta mudança. Tirar o
    // botão não pode virar "o time deixou de existir": um lead atribuído a um
    // agente sem registro falha por chave estrangeira, em produção, no meio de
    // um atendimento.
    const rota = fonteDaRotaDoTime();

    // ⚠️ Procura a CHAMADA, não o nome. A primeira versão usava
    // `toContain("garantirTimeNoSistema")` e passava com a chamada arrancada,
    // porque o `import` ainda carregava a palavra. Nome importado é intenção;
    // chamada é o que roda.
    expect(rota, "a rota não CHAMA mais quem garante o time").toMatch(
      /await\s+garantirTimeNoSistema\s*\(/,
    );
    expect(rota, "a rota deixou de devolver o time").toMatch(/TIME_DE_AGENTES\s*\.map/);
  });
});

describe("⭐ e por isso ele não aparece nas telas", () => {
  it("o papel do time não abre aba nenhuma do comercial", () => {
    // Coerência com o de cima: se o agente não entra, não faz sentido a lista
    // de abas responder por ele. Este caso pega a incoerência — alguém dando
    // telas a um papel que não tem como chegar nelas.
    const abas = abasDoComercial(PAPEL_DO_TIME).map((x) => x.rotulo);
    expect(abas, `o papel que não entra recebeu abas: ${abas.join(", ")}`).toEqual([]);
  });

  it("o vendedor de verdade continua enxergando a fila e a conversa", () => {
    // A metade que passa. Sem ela, uma `abasDoComercial` que devolvesse lista
    // vazia para TODO MUNDO passaria no caso acima — e a Sala inteira ficaria
    // sem menu.
    const abas = abasDoComercial("AGENTE_HUMANO").map((x) => x.rotulo);
    expect(abas).toContain("Conversas");
    expect(abas).toContain("Filas");
    // E criar conta continua sendo do dono.
    expect(abas).not.toContain("Criar acesso");
  });
});

describe("agentePorSlug", () => {
  it("acha quem existe", () => {
    expect(agentePorSlug("agente-1")?.nome).toBe("Agente 1");
  });

  it("devolve null para quem não existe, em vez de o primeiro da lista", () => {
    // Cair no primeiro seria pior que falhar: criaria a conta errada calada.
    expect(agentePorSlug("agente-99")).toBeNull();
    expect(agentePorSlug("")).toBeNull();
  });
});
