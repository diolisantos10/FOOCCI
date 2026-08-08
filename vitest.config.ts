import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals:     true,
    environment: "node",
    include:     ["src/**/*.test.ts"],

    /*
      PRAZO DE 20s NO LUGAR DOS 5s PADRÃO — e a razão é um padrão, não um teste.

      Em 06/08/2026, QUATRO arquivos diferentes reprovaram por `Test timed out in
      5000ms` — `noSideEffects`, `runRequest`, `dashboardModel` e `MetaOAuth`. Os
      três primeiros foram remendados um a um com prazo próprio. O quarto matou o
      argumento: rodando sozinho ele leva **371ms**. Treze vezes de folga, e ainda
      assim estourou no runner do CI.

      Ou seja: não são quatro testes lentos. É o relógio de 5s — pensado para teste
      unitário isolado — medindo uma bateria de 5.700 casos em máquina de duas
      linhas de execução, onde um worker starvado espera pela CPU sem estar fazendo
      nada de errado.

      O QUE ISSO CUSTA, dito com honestidade: um teste que trave de verdade agora
      demora 20s para reprovar em vez de 5s. A bateria inteira leva ~2 minutos, e
      esse é o preço aceito.

      O QUE ISSO **NÃO** MUDA: nenhuma asserção. Prazo não é portão — o que estes
      testes medem é conteúdo e determinismo, nunca velocidade. Se um dia algo
      estourar 20s, aí sim é sinal de verdade: alguma coisa ficou lenta.

      Portão que reprova por sorte ensina a rodar de novo até passar, e a partir daí
      já não barra nada. Foi por isso que virou configuração e não o quarto remendo.
    */
    testTimeout: 20_000,
  },

  /*
    JSX AUTOMÁTICO — necessário para um teste conseguir RENDERIZAR um componente.

    O `tsconfig.json` usa `"jsx": "preserve"` (o Next compila o JSX depois). O esbuild
    do Vitest lê isso e cai no runtime CLÁSSICO, que espera `React` no escopo do
    arquivo — e nenhum `.tsx` deste repositório importa React explicitamente, porque
    no Next isso não é preciso. Resultado: qualquer teste que importe um componente
    reprova com `ReferenceError: React is not defined` ANTES de asserir qualquer
    coisa. Foi exatamente o que aconteceu ao cobrir o Pixel da Meta.

    Isto não muda como o produto é compilado (quem constrói é o Next, pelo tsconfig):
    vale só dentro do Vitest, e só para os `.tsx` que um teste importar.
  */
  esbuild: { jsx: "automatic" },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
