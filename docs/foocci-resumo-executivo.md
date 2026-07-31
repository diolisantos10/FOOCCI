# Foocci — Resumo Executivo

**Documento de apoio à definição de faixas de preço.**
Para leitura por pessoas que nunca tiveram contato com o produto.

Data: 30 de julho de 2026 · Lançamento comercial previsto: semana seguinte.

---

## Aviso de leitura (importante para quem vai precificar)

Este documento foi escrito lendo o **código que está no ar**, não uma
apresentação comercial. Tudo que está descrito como pronto foi verificado no
sistema. O que ainda não está pronto, ou depende de terceiros, está marcado
explicitamente na seção **13 — Estado real de maturidade**.

Existe um ponto que precisa ser dito logo no começo, porque muda a conversa de
preço: **hoje o sistema não sabe cobrar por faixa.** Existe um campo de plano no
banco (`STARTER`, `GROWTH`, `PRO`), ele aparece no painel interno, mas **ele não
bloqueia absolutamente nada**. Todo restaurante que entra hoje recebe o produto
inteiro. Definir as faixas é uma decisão comercial que este documento serve; mas
**fazer as faixas existirem no produto é trabalho de engenharia que ainda não foi
feito**. Isso precisa entrar no plano de lançamento.

---

## 1. O que é o Foocci, em uma frase

O Foocci é o sistema que faz o restaurante **vender direto ao seu cliente e ser
dono dessa relação** — do cardápio digital ao pedido, do WhatsApp ao pós-venda —
com uma camada de inteligência artificial que atende, sugere, cobra o carrinho
esquecido e traz o cliente de volta.

Não é um cardápio digital. Não é só um CRM. Não é um marketplace.
É a operação comercial inteira do restaurante em um lugar só, com IA trabalhando
no bastidor.

---

## 2. A dor que ele resolve

O restaurante médio brasileiro hoje vive quatro problemas ao mesmo tempo:

**1. Ele não é dono do próprio cliente.**
Vende pelos marketplaces, paga 12% a 30% de comissão, e no fim do mês não tem o
telefone, o nome, o histórico nem o aniversário de ninguém que comprou. O cliente
é do aplicativo, não do restaurante. Se o marketplace muda a regra ou sobe a
taxa, o restaurante não tem para onde correr.

**2. O WhatsApp virou um caos.**
É onde o cliente quer falar, e é onde o restaurante perde venda: mensagem sem
resposta às 20h, pergunta de cardápio repetida cinquenta vezes por dia, pedido
anotado errado, ninguém sabe quem já foi respondido.

**3. Ele não sabe quem sumiu.**
Não existe lista de "clientes que compravam toda semana e pararam há 40 dias".
Essa informação existe — está espalhada nos pedidos —, mas ninguém tem tempo de
extrair, e sem ela não há reativação nenhuma.

**4. Ele não sabe se está ganhando dinheiro no prato.**
Preço definido "no olho" ou copiado do concorrente. Sem custo por item, sem CMV,
sem margem. Sobe o preço do queijo e ninguém percebe que aquele prato virou
prejuízo.

O Foocci ataca os quatro. E cada um deles é um eixo natural de faixa de preço.

---

## 3. O ciclo do produto

```
   Cliente chega  →  Pedido guiado  →  Histórico   →  Campanha  →  Cliente volta
   (WhatsApp,        (cardápio com     (CRM com       (na hora      (recorrência)
    QR, link)         IA vendedora)     contexto)      certa)
```

O restaurante aparece com **a marca dele**. O Foocci trabalha por trás.
O cliente final nunca vê "Foocci" — vê o restaurante.

---

# INVENTÁRIO COMPLETO DE MÓDULOS

Esta é a parte que interessa para montar as faixas. Cada bloco abaixo é um módulo
real, com o que ele faz. Estão marcados com:

- ✅ **pronto e em uso**
- 🔒 **pronto, mas depende de configuração/terceiro** (certificado, OAuth, número)
- 🧪 **existe, mas em piloto controlado**

---

## 4. Canal de venda próprio

O coração do produto. É por aqui que o restaurante deixa de pagar comissão.

| Recurso | O que é |
|---|---|
| ✅ Loja de pedidos (`/pedido`) | Cardápio digital completo, carrinho, checkout, com a marca do restaurante — cor, logo, tom. O cliente não vê Foocci. |
| ✅ Cardápio de mesa por QR Code (`/qr`) | Menu de salão com preço próprio, separado do delivery. |
| ✅ Preço por canal | O mesmo prato pode ter **três preços diferentes**: delivery, salão e iFood. Resolve a dor de embutir a comissão no preço sem penalizar quem compra direto. |
| ✅ Visibilidade por canal | Item pode aparecer no delivery e sumir do salão, ou o contrário. |
| ✅ Pausa de emergência | Botão que fecha a loja na hora, com motivo e prazo — "acabou o gás", "fila cheia". Sobrepõe o horário normal. |
| ✅ Horários de funcionamento | Por dia da semana, com **múltiplos períodos** (almoço e jantar separados). |
| ✅ Numeração sequencial de pedido | Contador próprio por restaurante, número humano ("Pedido #47"), não um código. |
| ✅ Links rastreáveis + link curto | Cria link por origem ("Instagram Bio", "QR na embalagem") e mede **cliques → clientes identificados → pedidos iniciados → pedidos concluídos → faturamento**. O restaurante descobre qual canal realmente vende. |

**Por que importa comercialmente:** um restaurante que fatura R$ 60 mil/mês em
marketplace paga entre R$ 7 mil e R$ 18 mil de comissão. Migrar 20% desse volume
para o canal direto já paga qualquer assinatura várias vezes.

---

## 5. Operação do pedido (o dia a dia da cozinha)

| Recurso | O que é |
|---|---|
| ✅ Painel de pedidos ao vivo | Fila com status: Aguardando → Confirmado → Em preparo → Pronto → Saiu para entrega → Entregue. Mais Cancelado e Aguardando pagamento. |
| ✅ Três tipos de pedido | Delivery, Retirada, Salão. |
| ✅ Alerta sonoro de pedido novo | **Repete até alguém aceitar.** Volume ajustável até 400% para cozinha barulhenta, três temas de som. |
| ✅ Alerta de "cliente precisa de gente" | Som separado, também repetindo até alguém assumir. |
| ✅ Trava de alarme entre aparelhos | Se a cozinha tem tablet, o caixa tem PC e o dono tem celular, **só um toca** — não vira coro. |
| ✅ Impressão automática de comanda | Agente local ("Carteiro") instalado no PC da loja. Pareamento por código curto. |
| ✅ Impressão por estação | Caixa, Cozinha 1 a 5, Copa, Cupom — cada uma com sua impressora física. O sushiman recebe o dele, a chapa recebe o dela. |
| ✅ Fila de impressão com garantia | Comanda que não imprimiu **volta para a fila** com espera crescente (10s, 30s, 1min, 2min, 5min) e só é dada como perdida depois de 5 tentativas. Não existe comanda que some em silêncio. |
| ✅ Letra grande na cozinha | Opção de dobrar a altura dos itens na comanda. |
| ✅ Registro de edição de pedido | Quem mexeu, o que mudou, quando. |

**Por que importa:** essa é a camada que faz o restaurante *confiar* no sistema.
Um pedido perdido e o dono desliga tudo. É também o que justifica preço: sistema
de cozinha é infraestrutura, não é "mais um app".

---

## 6. Cardápio e produto

| Recurso | O que é |
|---|---|
| ✅ Categorias, itens, ordenação | Estrutura completa, item pode aparecer em mais de uma categoria. |
| ✅ Variantes | Tamanhos, sabores — com preço próprio e obrigatoriedade de escolha. |
| ✅ Adicionais e grupos de opções | Bacon extra, ponto da carne, escolha de acompanhamento, com mínimo e máximo. |
| ✅ Esgotado no clique | Item marcado como indisponível some do carrinho sem sair do cardápio. |
| ✅ Carrossel de fotos | Várias imagens por produto na ficha, com capa definida. |
| ✅ Importação de cardápio por planilha | Reconhece coluna de foto, categoria, nome, descrição, preço, ingredientes, porção, alérgenos e mais — com prévia antes de gravar. |
| ✅ Melhoria de foto por IA | Foto ruim de celular vira foto de cardápio. Fluxo com aprovação humana: o dono aprova ou rejeita cada uma; o sistema avisa quando a foto original é ruim demais para salvar. |
| ✅ Campos de enriquecimento para a IA | Perfil de paladar, harmonização sugerida, alérgenos detalhados, storytelling. É o que faz o agente vender bem em vez de listar. |
| ✅ Porção e serve-quantas-pessoas | "300g", "serve 4" — o agente usa isso para sugerir combo certo para grupo. |

---

## 7. CMV e Precificação

Módulo próprio. Raro no mercado de sistemas para restaurante nessa faixa.

| Recurso | O que é |
|---|---|
| ✅ Custo por item | CMV unitário informado ou calculado. |
| ✅ Ficha técnica com ingredientes | Receita por prato: insumo, quantidade, custo. Sobe o preço do insumo, sobe o custo de todos os pratos que o usam. |
| ✅ Cálculo de markup real | O sistema pega **faturamento médio, despesas fixas mensais, impostos e taxas de cartão/app, e margem desejada** e devolve o preço que fecha a conta. |
| ✅ Reprecificação automática ou sugerida | Dois modos: sugerir e esperar aprovação, ou aplicar sozinho até um teto de variação (padrão 15%) — acima disso vira sugestão. |
| ✅ Arredondamento comercial | Preço termina em 90, ou inteiro, conforme a política da casa. |
| ✅ CMV do período | Estoque inicial + compras − estoque final ÷ faturamento. O termômetro do mês. |
| ✅ Histórico de mudança de preço | Quem mudou, de quanto para quanto, custo antigo e novo, por qual motivo. Sobrevive à exclusão do produto. |

**Por que importa comercialmente:** este módulo, sozinho, é vendido como produto
separado por outras empresas. É um forte candidato a diferenciar faixa.

---

## 8. Pagamentos

| Recurso | O que é |
|---|---|
| ✅ Pix, dinheiro, cartão, link | Configurável por restaurante. |
| ✅ Pagar agora / na entrega / na retirada | Três modos, com status próprio. |
| 🔒 Mercado Pago | Integração pronta; depende da credencial do lojista. |
| 🔒 SumUp | Integração pronta; depende da credencial do lojista. |
| ✅ Maquininha e Pix presencial | Registrados como método, para fechar o caixa certo. |
| ✅ Troco | Fluxo de troco para dinheiro. |

---

## 9. Nota fiscal (NFC-e) 🔒

Módulo fiscal completo, **opcional e desligado por padrão**.

- Emissão de NFC-e (modelo 65) pedido a pedido
- Cadastro fiscal completo: CNPJ, IE, IM, CNAE, razão social, regime tributário
- Endereço fiscal com código IBGE (exigência da SEFAZ)
- Série e numeração com incremento atômico — não gera nota duplicada
- CSC guardado **cifrado**
- Começa sempre em **homologação** (ambiente de teste da SEFAZ) e só vai para
  produção quando o lojista manda
- Defaults fiscais em três níveis: global → categoria → produto (NCM, CFOP,
  CSOSN/CST, origem, unidade, alíquota)
- Livro de notas: cada pedido tem seu documento com status, chave de acesso,
  protocolo e QR Code
- Aviso de validade do certificado A1 antes de vencer

**Depende de:** o lojista subir o certificado A1 e o Foocci registrar a empresa
dele no gateway. É um custo variável por documento emitido.

---

## 10. Entrega

| Recurso | O que é |
|---|---|
| ✅ Três modos de taxa | **Simples** (taxa única), **Zonas** (faixas com taxa e tempo próprios), **Distância** (base + valor por km, com piso e teto). |
| ✅ Pedido mínimo | Global ou por zona. |
| ✅ Frete grátis acima de X | Alavanca clássica de ticket médio. |
| ✅ Tempo estimado por zona | O cliente vê quanto demora antes de pedir. |
| ✅ Retirada | Liga e desliga independente do delivery. |

---

## 11. WhatsApp e canais

O canal onde o cliente brasileiro realmente está.

| Recurso | Estado |
|---|---|
| ✅ WhatsApp conectado (Evolution) | Conexão por QR Code, sem burocracia. |
| 🔒 WhatsApp Business oficial (Meta) | Provedor alternativo, com templates aprovados. Atrás de chave de ativação. |
| ✅ Troca de provedor sem perder histórico | E queda opcional para o outro provedor se o envio falhar — nunca envia duas vezes. |
| ✅ Agente recepcionista | Modo padrão: recebe, cumprimenta, responde o básico, manda o cardápio, passa para gente quando precisa. |
| 🧪 Agente que fecha o pedido pelo texto | O cliente pede por mensagem e o agente monta o carrinho. **Em piloto controlado, por lista de telefones autorizados.** |
| ✅ Personalidade configurável | Nome, tom (informal/neutro/premium), estilo (direto/consultivo/vendedor). |
| ✅ Menu de entrada | Botões iniciais configuráveis pelo lojista. |
| ✅ Passagem para humano | Telefone e mensagem de transferência. |
| 🔒 Instagram como canal | Configuração de canal existe. |
| 🔒 Google Meu Negócio + GA4 | Conexão OAuth pronta. |
| ✅ Identidade do cliente entre canais | O mesmo cliente reconhecido no WhatsApp, no site e no QR. |

---

## 12. Central de Conversas

Onde a equipe do restaurante fala com o cliente.

- ✅ Caixa única com WhatsApp, cardápio (link), QR de mesa e Instagram
- ✅ Assumir conversa: o atendente humano toma o lugar do agente
- ✅ Estados: aberta, aguardando, resolvida
- ✅ Histórico completo por cliente
- ✅ Alerta sonoro quando o agente decide que precisa de gente

---

## 13. CRM e relacionamento

O módulo com maior densidade de funcionalidade do produto inteiro.

### 13.1 Base de clientes

- ✅ Ficha por cliente: histórico de pedidos, ticket médio, frequência, preferências
- ✅ Segmentação automática: **Quente, Morno, Frio, Perdido, Sem pedidos**
- ✅ Importação de base antiga por planilha, com detecção automática de colunas e
  templates de mapeamento por sistema de origem
- ✅ Importação de base do Saipos/Nemo (fluxo dedicado)
- ✅ Limpeza automática: telefone inválido some, cliente sem contato é aposentado —
  com registro de **quem saiu e por quê**
- ✅ Sinais de dados do cliente: o que foi confirmado nunca é sobrescrito por
  inferência

### 13.2 Campanhas prontas — 16 no catálogo

O dono **não monta campanha do zero**. Ele liga a que quer. Cada uma já vem com
público, mensagem, horário seguro e cupom sugerido:

| # | Campanha | Quando dispara |
|---|---|---|
| 1 | ⭐ Pedir avaliação | Dias depois da entrega — mais avaliação no Google/iFood |
| 2 | 🎂 Aniversário | No dia, com mimo |
| 3 | 👋 Bem-vindo / 2ª compra | Dias após o 1º pedido |
| 4 | 🎯 Converter 1º pedido | Cadastrou e nunca pediu |
| 5 | 🌡️ Cliente quente esfriando | **Antes** de virar morno |
| 6 | 🍂 Cliente morno | **Antes** de virar frio |
| 7 | ❄️ Cliente frio | Última chance antes de perder |
| 8 | 🔍 Cliente perdido | Sumido há muito — oferta forte |
| 9 | 💎 Cliente VIP | Carinho periódico com quem mais gasta |
| 10 | 🆙 Subiu de nível | Parabeniza e premia |
| 11 | 🪜 Quase no próximo nível | O empurrão que gera o próximo pedido |
| 12 | 🎁 Mimo mensal por nível | Todo mês, para quem já subiu |
| 13 | ⏳ Cupom vencendo | Avisa antes de perder |
| 14 | 🛒 Carrinho abandonado | Começou o pedido e não terminou |
| 15 | 🤝 Indique um amigo | Os dois ganham cupom |
| 16 | 📱 Siga nas redes | Converte cliente em seguidor |

**A filosofia por trás:** resgatar **antes** do cliente cair de nível. A escada
(quente esfriando → morno → frio) dispara enquanto ele ainda é recuperável, não
depois de perdido. Isso é diferente de todo mundo que só faz "campanha de
reativação" quando já é tarde.

### 13.3 Segurança de envio (o que impede o restaurante de queimar o número)

Esta camada é invisível e é uma das mais valiosas:

- ✅ Teto diário global (padrão 200) e teto por ciclo
- ✅ **Horário de silêncio** — nada é enviado entre 21h e 8h
- ✅ Descanso por cliente: 24h entre mensagens
- ✅ Máximo de 5 mensagens por semana por cliente
- ✅ Atraso aleatório entre envios (5 a 45 segundos) — não parece robô
- ✅ Distribuição justa do orçamento entre campanhas, proporcional ao público
- ✅ Fila de prioridade: aniversário > carrinho abandonado > pedido de avaliação >
  reativação fria > promoção genérica
- ✅ Para tudo se a instância cair ou se a taxa de falha passar de 50%
- ✅ **Memória de impacto** — livro imutável de quem já foi contatado, por qual
  campanha e com qual mensagem. Campanha apagada e recriada **não** contata a
  mesma pessoa de novo. Mensagem parecida sob outro nome é reconhecida como
  duplicada.
- ✅ Falha permanente para de ser retentada para sempre
- ✅ Orçamento mensal de cupom, com custo estimado por cupom concedido

### 13.4 Cupons e promoções

- ✅ Seis tipos: percentual, valor fixo, combo, frete grátis, cupom com código, banner
- ✅ Alvo: produto, categoria ou pedido inteiro
- ✅ Canal: cardápio QR, delivery, WhatsApp ou todos
- ✅ Janela de validade com dia da semana e faixa de horário
- ✅ Regras: valor mínimo, quantidade mínima, limite de usos, uma vez por pessoa, acumulável ou não
- ✅ **Carteira de cupons do cliente**, estilo iFood — acumula, tem validade, e o
  cliente resgata no carrinho
- ✅ Recompensa física ("uma sobremesa grátis") com custo estimado

### 13.5 Programa de fidelidade por níveis

- ✅ Quatro níveis: **Bronze, Prata, Ouro, Diamante**
- ✅ Régua configurável por gasto **ou** por número de pedidos
- ✅ Janela móvel: contar os últimos N meses, ou vitalício. **Quem para de comprar,
  desce** — reclassificado diariamente.
- ✅ Benefícios próprios por nível, escritos pelo restaurante
- ✅ **Brinde físico com estoque real** — o sistema não deixa prometer 100 canecas
  quando só existem 30
- ✅ Desligado por padrão: o programa inteiro fica inerte até o dono ligar

### 13.6 Indicação

- ✅ Link pessoal por cliente; quando o indicado faz o primeiro pedido, os dois
  ganham. Cada cliente só pode ser indicado uma vez na vida.

---

## 14. Analytics e inteligência comercial

| Relatório | O que responde |
|---|---|
| ✅ Visão geral | Faturamento, pedidos, ticket médio, clientes novos, taxa de cancelamento, pedidos aguardando pagamento |
| ✅ Curva de produtos | O que vende, quanto representa do faturamento |
| ✅ **Produtos com zero venda** | O que está no cardápio ocupando espaço e não vende |
| ✅ Por categoria | Participação de cada categoria |
| ✅ Taxa de anexo (attach rate) | Quantos pedidos levam bebida, quantos levam sobremesa |
| ✅ Melhores clientes | Quem sustenta o faturamento |
| ✅ Distribuição por segmento e por nível | Saúde da base |
| ✅ Por canal | De onde vem a venda |
| ✅ Faturamento gerado por upsell | Quanto a sugestão do agente rendeu, **com exemplos reais** |
| ✅ **Retenção por safra (cohort)** | Dos clientes que compraram pela primeira vez em março, quantos voltaram em 30/60/90 dias |
| ✅ Eficiência operacional | Tempo do pedido até a entrega, atrasos, por tipo e por forma de pagamento |
| ✅ **Diagnóstico automático de causa** | O sistema compara com o período anterior e diz o que mudou e por quê — em português, sem inventar número, e explicitamente dizendo quando não há dado suficiente para afirmar |

Um detalhe de honestidade que vale mencionar: **pedido importado não entra nos
números de faturamento**. O histórico antigo fica visível na ficha do cliente,
mas não contamina o resultado do restaurante no Foocci. Ninguém vende crescimento
falso.

---

## 15. Agentes de IA

O Foocci tem uma arquitetura de agentes, não "um chatbot".

| Agente | O que faz |
|---|---|
| ✅ **Garçom** | Vende dentro do cardápio (`/pedido`). Sugere, monta combo, respeita restrição alimentar, nunca inventa produto nem preço. |
| ✅ **Recepcionista de WhatsApp** | Atende quem chega, responde, encaminha. |
| ✅ **Agente de CRM** | Escreve a mensagem da campanha com o contexto real do cliente. |
| ✅ **Agente de Analytics** | Lê os números e explica o que aconteceu. |
| ✅ **Assistente de ajuda do lojista** | Responde dúvida do dono sobre o próprio sistema, e escala para humano quando não sabe. |

### O que torna isso diferente de "colocar ChatGPT no WhatsApp"

Esta é a parte mais difícil de explicar e a mais valiosa:

**1. O agente não pode mentir.** Ele responde a partir de um retrato dos fatos do
restaurante — cardápio, preço, área de entrega, políticas. Um verificador
determinístico compara o que ele disse com o que é verdade e barra o que não bate.

**2. O agente é testado toda madrugada.** Um simulador cria clientes artificiais
— o indeciso, o vegano, o que pergunta de item que não existe, o que quer pagar,
o que recusa bebida — e roda contra o motor real. Cada falha é classificada por
gravidade (P0 crítico, P1, P2) e vira um item de trabalho. **Se aparecer um P0, o
sistema falha o processo e avisa, com a evidência exata do que o agente disse de
errado.**

**3. O agente melhora com prova, não com achismo.** Existe uma escada de promoção:
uma mudança de comportamento roda primeiro em sombra (calcula mas não envia),
acumula evidência, passa por um portão de qualidade e só então vai ao vivo.

**4. Existe um cofre de experiências entre restaurantes.** O que um restaurante
ensina ao sistema melhora o atendimento de todos — sem vazar dado de ninguém.

**Para a conversa de preço:** essa camada é a que sustenta a promessa. É também a
que tem custo variável real (tokens de IA) e a que mais justifica faixa alta.

---

## 16. Marca e presença

- ✅ Cor primária e secundária do restaurante aplicadas na loja inteira
- ✅ Logo, descrição, tom de voz
- ✅ Loja white-label: **o cliente final vê o restaurante, não o Foocci**
- ✅ Página de privacidade e termos por restaurante
- ✅ Banner promocional agendado por dia

---

## 17. Integrações

| Integração | Para quê |
|---|---|
| 🔒 **Saipos** (PDV) | Pedido confirmado no Foocci entra automático no PDV. Com webhook de status de volta e botão de reenvio quando falha. |
| 🔒 Mercado Pago / SumUp | Pagamento online |
| 🔒 Google Meu Negócio + GA4 | Avaliações e audiência |
| 🔒 Meta (WhatsApp oficial, Instagram, Facebook) | Canais oficiais |
| ✅ **API externa própria** | O restaurante gera uma chave e um sistema externo (ex.: o financeiro dele) consulta **vendas, produtos, clientes e financeiro**. A chave aparece uma vez só, fica guardada como hash, e é revogável na hora. |

---

## 18. Suporte, governança e segurança

- ✅ Canal de ajuda dentro do painel, com IA primeiro e escalada para humano
- ✅ Caixa de suporte no admin da Foocci
- ✅ Equipe com papéis: Dono, Gerente, Atendente
- ✅ Segredos guardados cifrados (AES-256-GCM) — token, CSC, credencial de gateway
- ✅ Isolamento entre restaurantes garantido em toda consulta
- ✅ Auditoria de qualidade automatizada, com histórico de P0/P1/P2
- ✅ Manual operacional versionado, com pedido de mudança e registro de decisão
- ✅ 4.523 testes automatizados rodando a cada alteração

---

# PARTE 2 — MATÉRIA-PRIMA PARA AS FAIXAS

## 19. O que muda de custo conforme o cliente cresce

Isto importa para definir o **piso** de cada faixa. Nem todo recurso custa igual:

| Item | Tipo de custo | Cresce com |
|---|---|---|
| Mensagens de WhatsApp (Meta oficial) | **Variável, por conversa** | Tamanho da base e volume de campanha |
| Tokens de IA (Garçom, CRM, Analytics, Ajuda) | **Variável, por uso** | Volume de pedidos e conversas |
| Melhoria de foto por IA | **Variável, por foto** | Tamanho do cardápio |
| Emissão de NFC-e | **Variável, por documento** | Volume de pedidos |
| Armazenamento de imagem | Variável, baixo | Tamanho do cardápio |
| Banco e infraestrutura | Semi-fixo | Volume de pedidos e histórico |
| Suporte humano | **Variável, alto** | Maturidade do cliente |

**Recomendação:** os eixos de cobrança que acompanham o custo real são
**volume de mensagens de CRM**, **uso de IA** e **número de pedidos**. Cobrar por
"quantidade de funcionalidade" desconecta preço de custo.

---

## 20. Os eixos naturais de faixa

Existem seis maneiras defensáveis de separar as faixas. Provavelmente a resposta
é uma combinação de duas ou três.

**Eixo A — Canais habilitados**
Só delivery próprio · + QR de mesa · + WhatsApp com agente · + Instagram

**Eixo B — Profundidade de CRM**
Base e segmentação (ler) · Campanhas prontas (agir) · Programa de níveis +
indicação + carteira de cupons (reter)

**Eixo C — Volume**
Mensagens de CRM por mês · pedidos por mês · clientes na base ativa

**Eixo D — Inteligência**
Sem IA (cardápio puro) · Agente no cardápio · Agente no WhatsApp ·
Agente de CRM escrevendo as campanhas · Analytics com diagnóstico automático

**Eixo E — Módulos de gestão**
CMV & Precificação · Nota fiscal · API externa · Integração com PDV

**Eixo F — Serviço**
Suporte por IA · suporte humano · onboarding assistido · gestão feita pela agência

---

## 21. Sugestão de arranjo (para o grupo debater, não para adotar)

Os nomes já existem no site: **Essencial**, **Crescimento**, **Performance**.

### Essencial — "pare de pagar comissão"
A promessa: ter o próprio canal de venda funcionando bem.

Loja de pedidos com a marca · cardápio completo com variantes e adicionais ·
QR de mesa · painel de pedidos com som · impressão de comanda por estação ·
horários e pausa de emergência · entrega em modo simples · pagamentos ·
base de clientes com segmentação automática · analytics essencial ·
links rastreáveis · ajuda por IA

### Crescimento — "faça o cliente voltar"
A promessa: transformar quem comprou uma vez em cliente recorrente.

Tudo do Essencial, mais:
WhatsApp conectado com agente recepcionista · Central de Conversas ·
**as 16 campanhas prontas** · carteira de cupons · promoções completas ·
carrinho abandonado · entrega por zona e por distância · importação de base ·
Agente Garçom no cardápio (o vendedor) · analytics de retenção por safra

### Performance — "gerencie como gente grande"
A promessa: margem, inteligência e integração.

Tudo do Crescimento, mais:
**CMV & Precificação completo** com ficha técnica e reprecificação ·
programa de fidelidade por níveis com brinde físico · indicação ·
Agente de CRM escrevendo as campanhas · diagnóstico automático de causa ·
eficiência operacional · nota fiscal · integração com PDV · API externa ·
melhoria de fotos por IA · suporte humano prioritário

### O que provavelmente é add-on, não faixa
- **Nota fiscal** — tem custo por documento e burocracia de certificado
- **Volume extra de mensagens** de CRM
- **WhatsApp oficial da Meta** — custo por conversa
- **Gestão feita pela agência** — é serviço, não software

---

## 22. Argumentos de venda que se sustentam em fato

Estes são checáveis. Não são promessa de marketing.

1. **"Você deixa de pagar comissão no que vende direto."** Verdadeiro e mensurável
   pelos links rastreáveis.
2. **"O cliente é seu."** Nome, telefone, histórico, aniversário, preferência —
   tudo fica na base do restaurante, exportável.
3. **"O sistema resgata o cliente antes dele sumir."** A escada de reativação
   dispara enquanto ele ainda compra, não depois.
4. **"O agente não inventa."** Existe um verificador que barra afirmação que não
   bate com o cardápio, e um simulador que testa isso toda madrugada.
5. **"Sua comanda não some."** A fila de impressão devolve o trabalho para a fila
   e só desiste depois de 5 tentativas.
6. **"Seu número não queima."** Horário de silêncio, teto diário, descanso por
   cliente, atraso aleatório e memória de quem já foi contatado.
7. **"Você sabe se o prato dá lucro."** CMV com ficha técnica e markup calculado
   sobre despesa real.
8. **"Seu cliente vê você, não a gente."** White-label de verdade.

---

## 23. Estado real de maturidade — leia antes de prometer

Honestidade aqui protege a operação comercial.

### Pronto e rodando
Loja de pedidos, cardápio, QR, pedidos, som, impressão, entrega, pagamentos
(base), clientes, segmentação, campanhas prontas, cupons, promoções, níveis,
analytics, Garçom no cardápio, recepcionista de WhatsApp, CMV/precificação,
links rastreáveis, ajuda, API externa.

### Pronto, mas depende de terceiro ou configuração
- **Nota fiscal** — precisa do certificado A1 do lojista e do registro no gateway
- **Mercado Pago / SumUp** — precisa da credencial do lojista
- **WhatsApp oficial da Meta** — atrás de chave de ativação; Evolution é o padrão
- **Google, Instagram, Facebook** — precisam de autorização OAuth
- **Saipos** — precisa de credenciamento junto à Saipos
- **Impressão** — precisa do agente instalado num PC Windows na loja

### Em piloto controlado
- **Pedido completo pelo texto no WhatsApp** — funciona, mas hoje só para uma
  lista de telefones autorizados. **Não vender como pronto ainda.**

### Não verificado no mundo real
- **A impressão física em restaurante** foi corrigida no servidor mas ainda não
  foi confirmada com alguém presente na loja vendo papel sair.

### Não existe ainda — e é bloqueador comercial
- **O sistema não sabe cobrar por faixa.** O campo de plano existe e não bloqueia
  nada. Qualquer faixa definida nesta reunião precisa que alguém implemente o
  bloqueio por plano antes de a primeira cobrança fazer sentido. **Este é o item
  que precisa sair da reunião com dono e prazo.**

---

## 24. As três perguntas que o grupo vai fazer

**"Quanto custa para a Foocci atender um restaurante?"**
Depende do volume: mensagens, tokens de IA, notas fiscais e suporte são
variáveis. Infraestrutura é semi-fixa. O documento não traz o número porque ele
ainda não foi apurado por restaurante — **isso precisa ser levantado antes de
fechar preço**, senão a faixa de entrada pode nascer com margem negativa.

**"O que impede o cliente de sair depois de 3 meses?"**
A base de clientes com histórico, os cupons na carteira, o nível conquistado, o
número de WhatsApp aquecido e o cardápio inteiro configurado. Quanto mais tempo
usa, mais caro fica sair. Isso favorece contrato anual com desconto.

**"Contra quem a gente compete?"**
Contra o marketplace (pelo canal), contra o cardápio digital simples (por
profundidade), contra o CRM genérico (por ser feito para restaurante) e contra o
PDV tradicional (que não faz relacionamento). O Foocci não é melhor que cada um
isoladamente — ele é o único que faz os quatro conversarem entre si. **É isso que
se cobra.**

---

*Documento gerado a partir da leitura do sistema em produção em 30/07/2026.
Cada recurso listado foi verificado no código. As marcações de maturidade são
conservadoras de propósito.*
