# 10 — Testes e critérios de aceite

## Os 15 critérios do comando

| # | Critério | Estado | Onde se verifica |
|---|---|---|---|
| 1 | Sala funcional dentro do Admin | ✅ | `/admin/sala-de-vendas` e as três sub-áreas |
| 2 | SDR entra sem acessar o resto do Admin | ✅ | `isolamento.test.ts` — rotas chamadas direto |
| 3 | Lead entra pelo WhatsApp | ✅ | webhook grava `LeadMensagem`; testado com reentrega |
| 4 | O TA recebe e qualifica | ⚠️ **parcial** | a régua de score e a ficha funcionam e são testadas; o TA está **desligado** e nunca respondeu a ninguém |
| 5 | Humano assume sem perder contexto | ✅ | dossiê congelado + ciclo IA → humano → IA |
| 6 | Gerente vê e administra a operação | ✅ | `/admin/sala-de-vendas/painel` |
| 7 | O funil funciona | ✅ | 11 etapas, regras testadas, quadro na tela |
| 8 | CRM e follow-ups funcionam | ✅ | tarefas, cadências e a fila "sem próxima ação" |
| 9 | QA avalia com evidências | ✅ | evidência é FK para a mensagem |
| 10 | Dados persistem corretamente | ✅ | migração aplicada e conferida com dados reais |
| 11 | Permissões testadas no backend | ✅ | `acessoAoLead.test.ts` + `isolamento.test.ts` |
| 12 | Sem números fictícios | ✅ | nenhum lead semeado; indicadores dizem "sem dados" |
| 13 | Desktop e mobile | ✅ | evidências em 1280 px e 390 px |
| 14 | Documentação atualizada | ✅ | os 12 arquivos deste diretório |
| 15 | Build, lint, typecheck e testes | ✅ | ver abaixo |

**14 de 15 cumpridos.** O 4 fica parcial, e é honestidade e não pendência de
engenharia: o caminho existe, é testado e está desligado. Chamá-lo de pronto
seria dizer que a IA qualificou alguém — e ela nunca falou com ninguém.

## Os portões

| Portão | Resultado |
|---|---|
| `tsc --noEmit` | limpo |
| `type-check:tests` | limpo |
| `type-check:scripts` | limpo |
| `next lint` | sem erro |
| Vitest | **6.952 passando**, 27 pulados, 523 arquivos |
| `next build` | completo |

## O que os testes provam, e não só cobrem

Todo teste tem as **duas metades**. Sem a metade que passa, uma função que
recusasse tudo ficaria verde na metade que recusa — e é assim que uma trava
quebrada sobrevive a uma suíte inteira.

Três travas foram verificadas quebrando a implementação de propósito:

| Trava | Como foi provada |
|---|---|
| `podeVerOLead` | removida a checagem → **6 testes reprovam** |
| Número de vendas | trocado um dígito → **3 testes reprovam** |
| Rodízio de distribuição | a ordenação invertida foi o bug, e o teste o pegou |

## Os defeitos que os testes acharam no meu próprio código

1. **O rodízio estava invertido.** `sort((a,b) => tempoDesde(b) - tempoDesde(a))`
   ordena do mais recente para o mais antigo — entregava o próximo lead
   exatamente a quem tinha acabado de receber. A fila inteira se concentraria
   numa pessoa enquanto o painel mostrava um time disponível, e nenhum erro
   apareceria.
2. **O comentário do score contradizia a régua.** Dizia que marketplace "vale
   mais que porte", e o código dava 18 contra 20. O teste afirma a **relação**
   entre os pesos, e não o número — para a régua não se contradizer em silêncio
   outra vez.
3. **A migração gerada quebraria com dados reais.** Cast direto num enum cujos
   valores antigos não existem mais.

## O que NÃO foi testado, e é preciso dizer

- **Envio real pelo WhatsApp.** A chave está desligada e não há credencial da
  Meta neste ambiente. O caminho de saída é testado até a gravação como
  PENDENTE; a entrega não.
- **O TA respondendo.** Ele está desligado.
- **Carga.** Não houve teste de volume.
