# Carteiro de Impressão — fonte

O agente local que roda no PC do restaurante e imprime os pedidos.
`carteiro.js` é o programa inteiro: **um arquivo, sem dependências** (só Node
nativo — `http`, `child_process`, `os`, `path`, `fs` e o `fetch` do Node).

## De onde veio este arquivo

O fonte tinha se perdido: só existia o `.exe` publicado em
`public/downloads/FOOCCI-Carteiro.exe`.

Deu pra recuperar porque o build de 2026-06-21 (`433782f4`) trocou o empacotamento
para `pkg --public` — que embute o JS em **texto puro**, sem bytecode. Foi uma
correção de bug na época (o V8 rejeitava o bytecode cross-build), e de quebra
deixou o fonte legível dentro do binário.

Extraído do `.exe` em 2026-07-25, conferido byte a byte contra o tamanho
registrado no índice do pkg (15.447 bytes) e validado como JS parseável.

> Lição: **o fonte mora aqui agora.** Se o próximo build voltar a usar bytecode,
> não haverá segunda chance de recuperar.

## Como rodar em desenvolvimento

```bash
node carteiro/carteiro.js
# abre em http://localhost:9999
```

## Como gerar o .exe

```bash
npx pkg carteiro/carteiro.js --targets node18-win-x64 --public \
  --output public/downloads/FOOCCI-Carteiro.exe
```

`--public` **não é opcional**: sem ele, o pkg embute bytecode do V8 e o binário
cross-buildado no Linux quebra ao abrir no Windows com
"V8 rejected the bytecode cache… mismatched host/target V8".

## O lado servidor (neste repo)

| O quê | Onde |
|---|---|
| Pareamento | `src/app/api/print-agent/pair/` |
| Fila (o Carteiro pergunta "tem pedido?") | `src/app/api/print-agent/poll/` |
| Confirmação de impressão | `src/app/api/print-agent/ack/` |
| Serviço | `src/services/print/PrintAgentService.ts` |
| Texto do cupom | `src/services/print/ticketText.ts` |

O Carteiro **sempre** vai até o FOOCCI (polling). A nuvem nunca inicia conexão
com o PC — é isso que faz funcionar atrás de qualquer firewall.
