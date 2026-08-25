# QA e critérios de aceite (v3)

## Os 16 critérios do CEO — estado em 25/08/2026

| # | Critério | Estado | Onde se verifica |
| --- | --- | --- | --- |
| 1 | Exatamente 6 departamentos oficiais | ✅ | teste conta o catálogo e compara com a tabela publicada nele; `db:conferir-v3` confere no banco |
| 2 | Cada departamento tem um Agente Gerente | ✅ | teste percorre os 6 e reprova se faltar ou se houver dois |
| 3 | Todo cargo abaixo do Diretor começa com "Agente" | ✅ | teste lê o catálogo; o script confere os 28 cargos gravados |
| 4 | Marketing não duplicado dentro da Foocci | ✅ | teste reprova departamento **ou ficha** de marketing/growth/mídia/CRO |
| 5 | Hierarquia aplicada no backend e na interface | ✅ | organograma sem ciclo, testes de autorização, tela `/admin/departamentos` |
| 6 | SDR humano vê só a Sala de Vendas autorizada | ✅ | `isolamento.test.ts`: a rota de departamentos declara papéis que o SDR não tem |
| 7 | Master e Diretor veem toda a operação | ✅ | `escopoDaConsulta` devolve `{}` para os dois — testado |
| 8 | IA e humanos compartilham e transferem atendimento | ✅ | ciclo IA → humano → IA contra Postgres real |
| 9 | Nenhuma transferência perde histórico | ✅ | o teste compara a linha do tempo inteira depois do ciclo |
| 10 | Toda ação sensível gera auditoria | ✅ | negativas entram na trilha com ator e motivo; trilha fora do ar **não** abre a porta |
| 11 | CRM comercial separado do CRM do produto | ✅ | são fichas diferentes, em departamentos diferentes; `Conversation` exige `restaurantId` e por isso não serve para prospect |
| 12 | Sala de Vendas em desktop e mobile | ✅ | capturas em 1280px e 390px em `evidencias/`, com o navegador conferindo que nenhuma das duas estoura na horizontal |
| 13 | Testes de autorização impedem acesso por URL/API | ✅ | as rotas são chamadas diretamente nos testes, sem passar por tela |
| 14 | Funil, WhatsApp, handoff e QA aprovados | ✅ | funil, handoff e QA prontos; o caminho do WhatsApp está **aceso** — número fixado, `wa.me` montado com a mensagem e o `#código`, testes provando dígito por dígito |
| 15 | Documentação completa na pasta determinada | ✅ | os 11 arquivos exigidos, mais o raio-x |
| 16 | Build, lint, typecheck e testes sem erro | ✅ | 6.780 testes, 177 contra Postgres real, três typechecks limpos, build completo |

**16 de 16 cumpridos**, com uma ressalva escrita abaixo que não cabe esconder numa marca verde.

### O critério 14, e um erro meu no meio dele

Em 25/08 eu registrei aqui que o 14 dependia do CEO "providenciar o número de WhatsApp de vendas". **Estava errado, e o erro era meu:** o número já tinha sido decidido por ele em 23/08 e estava escrito neste mesmo repositório, em `docs/whatsapp-vendas-passo-a-passo.md`, linha 1. O que faltava não era a decisão — era alguém ligar a chave. Eu não procurei antes de declarar a falta.

Ligado, o caminho é este: a pessoa preenche o formulário → o lead é **gravado** → ela é levada ao WhatsApp com a mensagem já escrita e o `#código` que liga aquele "oi" ao lead. Quem inicia a conversa é ela, que é o desenho inteiro (`docs/sdr-foocci-desenho.md`): abre a janela de 24h da Meta, o consentimento fica evidente e o risco de banimento cai a quase zero.

**A ressalva, em uma frase: o "oi" chega num aparelho, não na Sala de Vendas.** Enviar e receber são chaves separadas de propósito. A recepção automática — o "oi" virar registro na Sala sozinho, pelo `#código` — exige `FOOCCI_SALES_PHONE_NUMBER_ID` e `FOOCCI_SALES_ACCESS_TOKEN`, que são cadastro na Meta e não código. **Até lá, quem responde é uma pessoa, à mão.** Marcar o 14 como pronto sem esta frase seria vender como automático o que hoje é manual — guardrail 5.

## As evidências visuais

Em `evidencias/`, capturadas contra o sistema rodando de verdade, com sessão interna assinada:

| Arquivo | O que prova |
| --- | --- |
| `sala-de-vendas-sdr-desktop.png` | as sete filas com contagem, os leads que a IA devolveu, o motivo do pedido e o botão de assumir |
| `sala-de-vendas-sdr-mobile.png` | a 390px: filas empilhadas, sem estouro horizontal, menu recolhido no ☰ |
| `departamentos-ceo-desktop.png` | os seis cards, o Agente Gerente destacado, os indicadores de governança |
| `departamentos-negado-ao-sdr-*.png` | o que o SDR vê ao tentar a área que não é dele |

**O que a captura da Sala mostra sem precisar de legenda:** o SDR vê 3 leads, não os 4 que existem. O quarto está com a IA, e o escopo da consulta o deixa de fora. O isolamento não é uma afirmação deste documento — está na tela.

E o menu: 1 item para o SDR, 19 para o CEO. Verificado também por `curl`, direto no HTML que o servidor manda, sem navegador no meio.

## O instrumento da liberação

```bash
npm run db:conferir-v3
```

Doze conferências contra o banco de verdade, e uma regra que governa todas: **nenhuma devolve ✓ por ausência de dado**. Ver `08-PLANO-DE-CONSTRUCAO.md`.

## Como se escreve teste nesta casa

**Sempre as duas metades.** Um teste que só prova que o portão barra deixa passar um portão que barra todo mundo. Um que só prova que deixa entrar deixa passar um portão aberto.

**Teste de autorização espia a consulta, não só o resultado.** Um teste que olha apenas o retorno passa numa base de teste onde não existe dado do outro escopo — e passa exatamente até o dia em que existir.

**Teste que pula avisa alto.** Teste que depende de banco e some em silêncio é teste que ninguém percebe que parou de rodar.

**Concorrência se prova com concorrência.** Banco falso responde o que mandarem responder. Corrida se testa disparando os pedidos ao mesmo tempo contra Postgres de verdade.

**Prova nas duas direções.** Depois de escrever a trava, quebrar a implementação de propósito e confirmar que o teste reprova. Trava que nunca reprovou não é trava — é decoração.

## QA das conversas

O Agente de QA e Auditoria audita conversa contra script e política. Regras:

- **ausência de evidência não é aprovação.** Sem evidência, o resultado é "não sei" — que não é aprovado;
- toda não conformidade nasce com evidência anexada;
- quem audita não assina a liberação do que auditou.

## O que reprova a entrega, mesmo com tudo verde

- autorização que existe só no frontend;
- mock entregue como funcionalidade;
- indicador exibindo `0` quando o dado é indisponível — o certo é "não medido", com motivo;
- tabela duplicada sem justificativa técnica escrita;
- agente criado só para preencher organograma.
