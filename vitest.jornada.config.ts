/**
 * A configuração da JORNADA — separada da bateria unitária de propósito.
 *
 * A bateria de `vitest.config.ts` roda com dublê de banco e precisa continuar
 * rodando em qualquer máquina, sem Postgres. A jornada exige banco de verdade.
 *
 * Juntar as duas obrigaria a jornada a se PULAR quando não houvesse banco — e
 * teste que se pula sozinho vira verde por ausência, que é o defeito que esta
 * casa já mediu e nomeou. Aqui ela não pula: ou roda, ou o workflow reprova.
 */

import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["scripts/jornada-*.test.ts"],
    // A jornada fala com Postgres a cada passo; o relógio da bateria unitária
    // seria apertado para ela.
    testTimeout: 60_000,
    // Um arquivo, um processo: a jornada apaga e recria dados, e dois workers
    // dividindo o mesmo banco mediriam o estado um do outro.
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
