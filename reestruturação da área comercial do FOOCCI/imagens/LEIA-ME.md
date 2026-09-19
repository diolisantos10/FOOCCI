# As 14 peças do desenho do CEO — o índice

> ## ⛔ A regra, antes de tudo
>
> **A imagem é a fonte.** Todo texto desta pasta e da `../especificacao-visual/`
> é *leitura* dela, nunca substituto. **Onde a descrição escrita discordar da
> imagem, a imagem ganha** — a descrição foi feita por um agente e agente erra;
> o desenho é do CEO.
>
> Elas estão aqui versionadas de propósito, para que **todo agente que constrói
> tela olhe o pixel em vez de perguntar a alguém**. Desenho que vive só num chat
> morre quando a conversa fecha, e aí a régua vira memória de quem estava lá.

**As 14 estão arquivadas. Nenhuma está pendente.** (Conferidas uma a uma,
abrindo o arquivo, em 19/09/2026.) O número `NN` é a ordem do zip do CEO e
**não tem significado** — o significado está no slug.

## O índice

| Peça | Tela (o título que aparece nela) | Menu ativo |
|---|---|---|
| `desenho-01-fluxo-completo-atendimento-e-vendas-whatsapp.png` | **Fluxo Completo de Atendimento e Vendas via WhatsApp** — não é tela: é o diagrama do fluxo inteiro, do lead ao cliente | — (sem moldura) |
| `desenho-02-sala-do-supervisor-control-tower.png` | **Sala do Supervisor / Control Tower** — o agora da operação: quem entra, quem espera, quem converte | Painel |
| `desenho-03-central-de-atendimento.png` | **Central de Atendimento** — a mesa de trabalho do atendimento: caixas, canais e a conversa aberta | Atendimento |
| `desenho-04-perfil-do-lead-crm-360.png` | **Perfil do Lead / CRM 360** — a ficha completa de um lead: dados, linha do tempo, conversas e insights da IA | Painel ⚠️ |
| `desenho-05-atendimento-com-ia-copiloto-do-vendedor.png` | **Atendimento com IA / Copiloto do Vendedor** — a conversa com a IA sugerindo ao lado, sem enviar sozinha | Atendimento |
| `desenho-06-qualificacao-e-lead-score.png` | **Qualificação e Lead Score** — a tabela que prioriza os leads por temperatura e score | Leads |
| `desenho-07-motor-de-decisao-roteamento.png` | **Motor de Decisão / Roteamento** — as regras que decidem se a IA continua ou transfere, e para quem | Automações |
| `desenho-08-catalogo-oferta-e-checkout.png` | **Catálogo, Oferta e Checkout** — montar a proposta e gerar o link de pagamento | Vendas |
| `desenho-09-follow-up-automatico.png` | **Follow-up Automático** — o construtor visual da jornada de recuperação e as automações ativas | Automações |
| `desenho-10-pos-venda-e-relacionamento.png` | **Pós-venda e Relacionamento** — a ficha de quem já comprou: saúde, histórico e oportunidades | Pós-venda |
| `desenho-11-crm-ia-departamento-de-crm.png` | **CRM IA / Departamento de CRM** — o plano do dia por contato, com segmento, próxima ação e janela ideal | CRM |
| `desenho-12-central-sdr-gatekeeper.png` | **Central SDR / Gatekeeper** — atravessar o porteiro e chegar ao decisor | SDR |
| `desenho-13-revenue-supervisor-inteligencia-de-receita.png` | **Revenue Supervisor / Inteligência de Receita** — o funil de receita, o gargalo e o diagnóstico da IA | Painel |
| `desenho-14-hunter-ia-inteligencia-comercial.png` | **Hunter IA / Inteligência Comercial** — descobrir, enriquecer e priorizar restaurantes | Prospecção |

⚠️ **Peça 04:** a migalha diz `Leads › Perfil do Lead`, mas o item aceso na
lateral é **Painel**. É incoerência do próprio desenho, registrada aqui por
honestidade. Quem construir a tela acende **Leads**.

## O que a leitura das imagens desmentiu

**Não existe uma lateral única.** O texto antigo dizia que a moldura era
"idêntica em todas". Não é — há **três** laterais no conjunto:

| Lateral | Itens | Em que peças |
|---|---|---|
| **Curta (8)** | Painel · Atendimento (12) · Leads · Vendas · Automações · Campanhas · Relatórios · Configurações | 02, 03, 04, 05, 06, 07, 08, 09 |
| **Com Pós-venda (9)** | a curta + **Pós-venda** entre Vendas e Automações | 10 |
| **Completa (11)** | Painel · **Prospecção** · **SDR** · Atendimento (12) · Leads · Vendas · **CRM** · Automações · Campanhas · Relatórios · Configurações | 11, 12, 13, 14 |

Nenhuma peça mostra **Pós-venda e Prospecção/SDR/CRM ao mesmo tempo**. O menu
final da nossa área precisa dos dois — isso é **decisão a tomar**, não coisa
que se lê do desenho.

**O que é mesmo igual nas 13 telas:** o cabeçalho escuro com o ícone verde do
WhatsApp e "Atendimento & Vendas WhatsApp / Mais conversas. Mais vendas."; a
busca central com **Ctrl + K** ("Buscar leads, conversas ou vendas..."); o sino
com o contador **3**; o bloco "Carlos Mendes / Supervisor" com foto e seta; e o
cartão verde de plano no rodapé da lateral ("Plano Profissional · 200.000
conversas/mês · 142.315 utilizadas · 71% · Gerenciar plano").

**O que NÃO é igual:** o seletor de data só aparece em 02, 10, 11, 12, 13 e 14
(o segundo seletor é "Tempo real" em 02, 11, 12 e 13; "Todos os clientes" em 10;
"Últimos 30 dias" em 14). As peças 03, 04, 05, 06, 07, 08 e 09 **não têm seletor
de data nenhum** — têm outros controles no mesmo lugar. E as peças 03, 04, 05,
07, 08 e 09 **não têm fila de cartões-indicadores**.

## Onde está a leitura de cada uma

- `../especificacao-visual/03-AS-14-TELAS.md` — a leitura peça por peça,
  **conferida contra a imagem** (é a versão que vale).
- `../especificacao-visual/00-MOLDURA-COMUM.md` e `01-TELAS.md` — a leitura
  anterior, feita olhando as telas no chat.
- `../especificacao-visual/02-FIDELIDADE.md` — o veredito desenho × código.
