# Ligar um produto ao Dioli Connect

> Contrato comum **v1.0.0**. Este arquivo é para quem vai conectar o próximo
> produto — Dioli Digital, CityJobs, FOOCCI Manager — e a promessa dele é que
> isso seja **ligar**, não reescrever.

## O que se copia, e não se edita

A pasta `conector/` inteira, menos `foocci/`:

```
contrato.ts       os caminhos, os tipos, o protocolo
politicas.ts      o passo 2 e os cortes de validade (revogada, exceção, vigência)
barreira.ts       ⛔ cliente externo nunca lê comunicação interna
pendencias.ts     o contrato do armazém e o casamento do retorno
retorno.ts        o passo 8, em código puro
aviso.ts          o texto de "estou esperando a decisão"
atendimento.ts    o orquestrador dos passos 1→4
ligacaoLocal.ts   a interface que o seu produto implementa
versao.ts         a versão e as impressões digitais ⚠️ NÃO EDITAR AO COPIAR
tests/compatibilidade-do-contrato.test.ts   a trava, roda na sua CI
tests/armazemEmMemoria.ts                   o armazém de teste
```

⛔ **Editar qualquer um deles deixa a CI do seu produto vermelha.** É de
propósito (decisão C3): o contrato comum não pode virar quatro contratos.
Precisa mudar? Muda-se **uma vez, no dono do padrão**, sobe-se
`VERSAO_DO_CONTRATO`, e copia-se para os quatro.

## O que se escreve — um arquivo

```ts
export function ligacaoDoSeuProduto(db, opcoes): LigacaoLocal {
  return {
    produto: "cityjobs",          // qual produto
    canal:   "atendimento",       // qual tela/canal
    agente:  "sdr",               // qual agente atende
    armazem: armazemNoBanco(db),  // onde a pendência é gravada
    async falarComOCliente(conversa, texto, { agora }) {
      // como o SEU produto fala com o cliente. Nunca lança.
      // devolve { registrada, entregue, mensagemId?, causa? }
    },
  };
}
```

E o chamador, no lugar onde o seu agente já decide que não pode responder:

```ts
const r = await atenderComOConector(ligacao, pedido, escalar, deps);
```

`escalar` é a sua escalada (o despacho ao gerente) e devolve
`{ aberta, fio, detalhe }`.

## O que o produto precisa ter

| Peça | Não tem? |
|---|---|
| `DIOLI_CONNECT_URL` e `DIOLI_CONNECT_SECRET` | O conector fica **fechado** por construção (`nucleoNaoConfigurado`); tudo escala como escalava. Nada quebra. Quem configura é operador técnico autorizado (decisão C2). |
| Rota `POST /api/connect/retorno` | Casca de ~5 linhas: confere o segredo, chama `receberRetorno`, devolve o estado. **Next: precisa da linha exata no middleware**, senão o handler nunca roda e o 401 genérico se disfarça de recusa da porta. |
| Tabela de pendências (11 colunas, nenhuma de política) | Qualquer persistência serve — desde que **sobreviva a restart**. Memória de processo some no deploy e o cliente vira órfão. |
| Um gatilho que classifique "fora da alçada" em código | O produto ainda não está pronto para conectar: a peça a construir é o gatilho. |
| Uma fila humana | Ela continua sendo o chão quando tudo falha. |

## As três coisas que o produto NÃO decide

Guardar política. Decidir se uma exceção se estende. Escolher o que atravessa a
barreira. Soltas em quatro produtos, essas viram quatro respostas diferentes
para a mesma pergunta — e é por isso que moram no comum.
