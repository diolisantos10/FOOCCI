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
import {
  TIME_DE_AGENTES,
  PAPEL_DO_TIME,
  DEPARTAMENTOS_DO_TIME,
  agentePorSlug,
} from "./timeDeAgentes";
import { abasDoComercial } from "@/lib/sala/rotas";

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

describe("⭐ o papel deixa o agente trabalhar", () => {
  it("é AGENTE_HUMANO, e não AGENTE_IA", () => {
    // Parece o contrário do certo, e não é. `AGENTE_IA` está escrito no schema
    // como ator técnico que **nunca faz login interativo** — é o papel do TA,
    // que não abre tela nenhuma. Estes aqui abrem: assumem lead, respondem,
    // movem no funil. Trocar por AGENTE_IA não os tornaria "mais robôs",
    // tiraria deles as telas, e o sintoma seria "o agente não abre a conversa".
    expect(PAPEL_DO_TIME).toBe("AGENTE_HUMANO");
  });

  it("com esse papel ele enxerga a fila e a conversa", () => {
    // A outra metade: não basta o papel existir, ele precisa abrir as telas do
    // trabalho. Se a lista de abas mudar e o vendedor perder a conversa, este
    // caso cai junto.
    //
    // ⚠️ E ele prova só isso. Hoje Filas e Conversas estão em `PARA_TODOS`, ou
    // seja, a aba não distingue papel — trocar AGENTE_HUMANO por outro papel
    // qualquer passaria aqui. Quem pega essa troca é o caso acima, pelo nome.
    const abas = abasDoComercial(PAPEL_DO_TIME).map((x) => x.rotulo);
    expect(abas, `abas do agente: ${abas.join(", ")}`).toContain("Conversas");
    expect(abas).toContain("Filas");
  });

  it("e NÃO enxerga criar acesso — agente não cria agente", () => {
    // Criar conta é do dono. Um agente que cria agente fecha o laço sozinho.
    const abas = abasDoComercial(PAPEL_DO_TIME).map((x) => x.rotulo);
    expect(abas).not.toContain("Criar acesso");
  });

  it("trabalha em vendas, e só", () => {
    expect(DEPARTAMENTOS_DO_TIME).toEqual(["vendas"]);
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
