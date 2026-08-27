/**
 * O PISO DA SENHA ESCOLHIDA À MÃO.
 *
 * ── O PEDIDO, E POR QUE ELE ESTÁ CERTO ──────────────────────────────────────
 *
 * O CEO, em 27/08/2026: *"que não gere senha aleatória. A gente escolha qual
 * que é a senha que a gente vai pôr lá, porque são senhas super difíceis de
 * lembrar."*
 *
 * O pedido é bom, e recusá-lo em nome da segurança seria o tipo de rigor que
 * piora as coisas: uma senha que ninguém consegue guardar acaba num post-it
 * colado no monitor, e post-it é pior que senha média.
 *
 * ── ⚠️ POR QUE ISTO É UM ARQUIVO SEPARADO ───────────────────────────────────
 *
 * Porque a **tela** também precisa desta regra — para avisar enquanto a pessoa
 * digita, em vez de deixá-la clicar em "Criar" e levar um não.
 *
 * A primeira versão importou a função de `pessoas.ts` direto no componente. Isso
 * arrastaria Prisma, `bcryptjs` e `crypto` para o pacote do navegador: build
 * quebrado, ou — pior — passando e mandando código de servidor para o cliente.
 *
 * Aqui não há import nenhum. É texto entrando e texto saindo, e roda nos dois
 * lados. **A regra mora em UM lugar**: duas cópias, uma no navegador e outra no
 * servidor, discordariam no primeiro ajuste — e o sintoma seria a tela dizendo
 * "ok" e o servidor recusando sem explicar.
 *
 * ── E O QUE ESTE PISO NÃO É ─────────────────────────────────────────────────
 *
 * Não é medidor de força e não exige maiúscula, número e símbolo. Essa regra
 * produz `Senha@123` — que atende a todos os requisitos e está em qualquer
 * dicionário de ataque. Ela treina as pessoas a satisfazer o validador, não a
 * escolher senha boa.
 *
 * O que ele barra é o que aparece de verdade: senha curta, senha óbvia, e senha
 * feita do próprio nome ou e-mail de quem vai usá-la.
 */

/**
 * O mínimo.
 *
 * Oito, e não doze: esta tela é usada com a pessoa do lado, e o número precisa
 * ser cumprível sem discussão. O que protege de verdade nesta casa é a senha
 * não ser reaproveitada de outro lugar e o acesso poder ser cortado na hora —
 * as duas coisas já existem.
 */
export const MINIMO_DE_CARACTERES = 8;

/**
 * As senhas que aparecem quando alguém escolhe com pressa.
 *
 * Lista curta de propósito. Uma lista enorme (há milhões de senhas vazadas) daria
 * falsa sensação de proteção e recusaria senha boa por coincidência. O trabalho
 * pesado é das outras duas regras.
 */
const OBVIAS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "senha123",
  "senha1234",
  "password",
  "password1",
  "foocci123",
  "foocci2026",
  "abcd1234",
  "qwerty123",
  "11111111",
  "00000000",
  "mudar123",
  "trocar123",
]);

/**
 * A senha escolhida serve?
 *
 * Devolve o motivo em português de gente, ou `null` quando está boa. O motivo é
 * o que aparece na tela — por isso é frase, e não código de erro.
 *
 * ⚠️ Quem chama do navegador está usando isto por conveniência. `criarPessoa`
 * chama de novo no servidor, e é essa segunda chamada que vale: qualquer um
 * consegue bater na rota por fora da tela, e trava que só existe na tela é
 * decoração.
 */
export function problemaComASenha(
  senha: string,
  dono: { nome?: string; email?: string } = {},
): string | null {
  if (senha !== senha.trim()) {
    // Espaço nas pontas some ao colar, ao digitar no celular e em metade dos
    // formulários. A pessoa criaria uma senha que ela mesma não repete.
    return "A senha não pode começar nem terminar com espaço.";
  }

  const s = senha;

  if (s.length < MINIMO_DE_CARACTERES) {
    return `A senha precisa ter pelo menos ${MINIMO_DE_CARACTERES} caracteres.`;
  }
  if (OBVIAS.has(s.toLowerCase())) {
    return "Essa é uma das senhas mais tentadas do mundo. Escolha outra.";
  }

  // Nome e e-mail da própria pessoa: é o primeiro palpite de quem tenta entrar,
  // e é exatamente o que vem à cabeça de quem está criando o acesso dela com
  // pressa. `>= 4` evita acusar um "ana" que caiu no meio de outra palavra.
  const minuscula = s.toLowerCase();
  const partes = [
    (dono.email ?? "").split("@")[0] ?? "",
    (dono.nome ?? "").trim().split(/\s+/)[0] ?? "",
  ];

  for (const parte of partes) {
    const p = parte.toLowerCase();
    if (p.length >= 4 && minuscula.includes(p)) {
      return "A senha não pode conter o nome nem o e-mail da pessoa.";
    }
  }

  return null;
}
