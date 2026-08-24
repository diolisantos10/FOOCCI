# 02 — Arquitetura da Sala

## O desenho em uma frase

Núcleo **puro** separado do acesso a banco, e banco separado da tela — porque a
mesma regra precisa servir à tela, à rota e ao TA, e regra que só é testável com
banco em pé acaba não sendo testada.

## Os módulos

```
src/services/salaDeVendas/
  conversa.ts      recebe, envia, status de entrega, janela de 24 h
  score.ts         a régua, e a CONTA que a explica
  handoff.ts       os gatilhos e o dossiê
  distribuicao.ts  quem PODE antes de quem é a VEZ
  funil.ts         as regras do movimento entre etapas
  followUp.ts      tarefas, cadências, e a fila de quem ficou sem plano
  agenda.ts        compromissos, comparecimento, remarcação encadeada
  qa.ts            o scorecard de 15 critérios
  painel.ts        os indicadores do gerente
  filas.ts         as sete filas e o escopo da consulta  (v3)
  responsavel.ts   de quem é o lead agora, atomicamente  (v3)
```

## As decisões que moldaram o resto

### Escrita condicional em vez de ler-decidir-gravar

Toda mudança de dono, de etapa e de status é `updateMany` com a condição de
estado **dentro do `where`**. Não é zelo: entre um `findUnique` e um `update`
cabe o segundo clique, o segundo webhook e o segundo SDR — e cabem justamente
nos momentos de pico, que é quando o defeito importa.

O compilador não reclama quando alguém troca por leitura-seguida-de-escrita.
Os testes de corrida reclamam.

### `responsavel.ts` e `handoff.ts` são dois arquivos

O primeiro faz a troca de mão, atômica e crítica. O segundo decide **quando** a
IA deve largar e **o que vai junto** — lógica que muda toda semana. A troca de
dono não pode carregar no colo uma regra que muda tanto.

### O espelho na linha do lead

`ultimaMensagemEm`, `naoLidas`, `proximaAcaoEm` são **cache** na tabela
`SiteLead`. A verdade são as linhas de `LeadMensagem` e `LeadTarefa`.

Existe porque a lista de conversas mostra esses campos em toda linha, e um
`count` por lead a cada carregamento é o que faz uma tela de atendimento ficar
lenta exatamente no dia movimentado.

### A ficha 360º é outra tabela

Quinze campos que a **lista** nunca lê e a **ficha** sempre lê. Na tabela
principal, engordariam cada linha de toda consulta de fila para servir uma tela
por vez.

## O que a Sala NÃO faz

- não envia mensagem enquanto `FOOCCI_SDR_SEND_ENABLED` estiver desligada;
- não submete modelo à Meta;
- não é mock: o que está na tela vem do banco, e o que não vier diz "sem dados"
  com o motivo;
- não cria lead de exemplo.
