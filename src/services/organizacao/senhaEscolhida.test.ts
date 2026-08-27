/**
 * A SENHA ESCOLHIDA À MÃO — o piso, e por que ele é código.
 *
 * ── O PEDIDO DO CEO, E O QUE ELE ABRE ───────────────────────────────────────
 *
 * *"Que não gere senha aleatória. A gente escolha qual que é a senha, porque são
 * senhas super difíceis de lembrar."*
 *
 * O pedido está certo: senha que ninguém guarda acaba num post-it colado no
 * monitor, e post-it é pior que senha média. Recusar em nome da segurança seria
 * o rigor que piora as coisas.
 *
 * Mas quem escolhe senha à mão escolhe mal — não por descuido, é assim que gente
 * funciona. E esta tela não dá acesso a uma planilha: dá acesso à Sala de Vendas
 * inteira, com carteira de clientes e conversas.
 *
 * ── O QUE ESTES CASOS GUARDAM ───────────────────────────────────────────────
 *
 * Cada regra aparece **duas vezes**: uma provando que ela barra o caso ruim,
 * outra provando que ela deixa passar uma senha boa de verdade. Sem a segunda
 * metade, uma função que recusasse tudo passaria em todos os bloqueios — e a
 * tela ficaria impossível de usar com o teste verde.
 */

import { describe, it, expect } from "vitest";
import { problemaComASenha, MINIMO_DE_CARACTERES } from "./senhaEscolhida";

const MARINA = { nome: "Marina Souza", email: "marina@foocci.com.br" };

describe("⭐ a senha boa passa — a metade que impede o piso de travar a casa", () => {
  it("uma frase que dá para falar em voz alta serve", () => {
    // O caso que o CEO quer: algo que ele consiga ditar para a pessoa do lado.
    for (const s of ["chopp gelado 22", "pizzaria do centro", "MesaDoFundo2026"]) {
      expect(problemaComASenha(s, MARINA), `recusou "${s}"`).toBeNull();
    }
  });

  it("não exige maiúscula, número nem símbolo", () => {
    // Essa regra produz `Senha@123` — atende a tudo e está em qualquer
    // dicionário de ataque. Ela treina a pessoa a satisfazer o validador, não a
    // escolher senha boa.
    expect(problemaComASenha("cadeiravermelha", MARINA)).toBeNull();
  });

  it("acento e espaço no meio são aceitos", () => {
    expect(problemaComASenha("café com pão", MARINA)).toBeNull();
  });
});

describe("⭐ o que o piso barra", () => {
  it("⭐ senha curta", () => {
    const r = problemaComASenha("abc123", MARINA);
    expect(r).not.toBeNull();
    expect(r).toContain(String(MINIMO_DE_CARACTERES));
  });

  it("exatamente no mínimo passa — a fronteira é onde mora o erro de um-a-mais", () => {
    const noLimite = "a".repeat(MINIMO_DE_CARACTERES);
    expect(problemaComASenha(noLimite, MARINA)).toBeNull();
    expect(problemaComASenha("a".repeat(MINIMO_DE_CARACTERES - 1), MARINA)).not.toBeNull();
  });

  it("⭐ as senhas mais tentadas do mundo", () => {
    for (const s of ["12345678", "senha123", "password", "Foocci123", "QWERTY123"]) {
      expect(problemaComASenha(s, MARINA), `aceitou "${s}"`).not.toBeNull();
    }
  });

  it("⭐⭐ e a senha feita do nome ou do e-mail da própria pessoa", () => {
    // O primeiro palpite de quem tenta entrar, e exatamente o que vem à cabeça
    // de quem está criando o acesso com pressa: "marina2026".
    expect(problemaComASenha("marina2026", MARINA), "aceitou o e-mail dela").not.toBeNull();
    expect(problemaComASenha("Marina Souza 1", MARINA), "aceitou o nome dela").not.toBeNull();
  });

  it("⭐ mas não acusa um pedaço curto que caiu ali por acaso", () => {
    // Um teste que grita à toa é um teste que alguém desliga — e aí a trava some
    // junto. "Ana" tem 3 letras e apareceria dentro de dezenas de palavras.
    const ana = { nome: "Ana Lima", email: "ana@foocci.com.br" };
    expect(problemaComASenha("banana quente", ana), "acusou por causa de 'ana'").toBeNull();
  });

  it("⭐ espaço nas pontas", () => {
    // Some ao colar, ao digitar no celular e em metade dos formulários. A pessoa
    // criaria uma senha que ela mesma não consegue repetir.
    const r = problemaComASenha(" chopp gelado ", MARINA);
    expect(r).not.toBeNull();
    expect(r).toMatch(/espaço/i);
  });
});

describe("sem dono informado, ainda funciona", () => {
  it("as regras que não dependem da pessoa continuam valendo", () => {
    // A tela chama isto com nome e e-mail ainda vazios enquanto a pessoa digita
    // de baixo para cima. Não pode quebrar nem liberar tudo.
    expect(problemaComASenha("12345678")).not.toBeNull();
    expect(problemaComASenha("abc")).not.toBeNull();
    expect(problemaComASenha("chopp gelado 22")).toBeNull();
  });

  it("nome vazio não vira regra que recusa tudo", () => {
    // O defeito clássico: `"".length >= 4` é falso, mas um `includes("")` é
    // sempre verdadeiro — e toda senha seria recusada por "conter o nome".
    expect(problemaComASenha("chopp gelado 22", { nome: "", email: "" })).toBeNull();
  });
});

describe("⭐ a mensagem é para gente ler", () => {
  it("volta frase em português, não código de erro", () => {
    // É o texto que aparece embaixo do campo. Um `ERR_PWD_TOO_SHORT` faria a
    // tela mostrar isso para o CEO.
    const r = problemaComASenha("abc", MARINA)!;
    expect(r).toMatch(/[a-záéíóúâêôãõç]{4,}/i);
    expect(r).toMatch(/\.$/);
  });
});
