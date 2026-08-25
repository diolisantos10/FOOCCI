# Sala de Vendas e SDRs da Foocci

**Data:** 25/08/2026 · **Estado:** construída, **não operando**
**Comando:** ARQUITETO — Construção urgente da Sala de Vendas e SDRs da Foocci

## O que é

A plataforma, dentro do Admin, onde os leads que querem **contratar a Foocci**
são recebidos, qualificados, distribuídos, acompanhados e convertidos.

⚠️ **Estes leads não são consumidores de restaurante.** Um dono de pizzaria
interessado no Foocci e um cliente pedindo uma pizza são duas bases, duas leis e
duas tabelas. Nada neste diretório toca `Customer`, `Conversation` ou `Message`
— e o motivo está escrito em `01-RAIO-X-DO-EXISTENTE.md`.

## O estado, sem adjetivo

| | |
|---|---|
| Telas | construídas e navegáveis |
| Banco | migrado, com 14 tabelas novas |
| Recepção de WhatsApp | **ligada** — a mensagem entra e é gravada |
| Envio de WhatsApp | **desligado** (`FOOCCI_SDR_SEND_ENABLED`) |
| Agente SDR IA (TA) | **desligado** (`sdr_ia_config.ligado = false`) |
| Distribuição automática | **manual** por padrão |
| Cadências | **inativas** |
| Leads de exemplo | **nenhum**, e nunca haverá |

A Sala nasce operada por gente. Ligar cada peça é ato humano, uma por vez, com
evidência — é a escada de liberação do Cérebro aplicada aqui.

## Ordem de leitura

| # | Documento | Para quê |
|---|---|---|
| 01 | Raio-x do existente | o que foi reusado, e o que não serviu — com motivo |
| 02 | Arquitetura da Sala | as peças e por que estão separadas assim |
| 03 | Funil e regras | as 11 etapas e o que pode em cada movimento |
| 04 | O TA (SDR de IA) | configuração, versão e limites |
| 05 | Handoff IA ↔ humano | os gatilhos e o dossiê |
| 06 | RBAC e permissões | a matriz, e as três camadas |
| 07 | WhatsApp | recepção, envio, janela de 24 h e idempotência |
| 08 | QA de vendas | o scorecard de 15 critérios |
| 09 | Modelo de dados | o que nasceu e o que foi reusado |
| 10 | Testes e critérios de aceite | como se sabe que acabou |
| 11 | Operação e runbook | como ligar, e o que fazer quando quebrar |

## As quatro regras que atravessam tudo

1. **Zero não é "não sei".** Score sem medição é `null`; taxa sem amostra é
   "sem dados"; espera sem fila é "ninguém esperando". A tela nunca escreve um
   número que ninguém apurou.
2. **Permissão vive no servidor, em três camadas.** Tela, rota e **consulta**. A
   terceira é a que costuma faltar.
3. **Nada nasce ligado.** Nenhuma IA, nenhum envio, nenhuma cadência.
4. **A base de vendas não recebe dado falso.** Nem para demonstração.
