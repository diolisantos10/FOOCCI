# ⛔ ESTA ARQUITETURA ESTÁ SUPERADA

**Data da decisão:** 25/08/2026 · **Substituída por:** `docs/arquitetura-operacional-foocci-v3/`

A planta de **9 departamentos** descrita nesta pasta **não é mais a arquitetura oficial da Foocci**.

## Por quê

Decisão do CEO: a estrutura estava superdimensionada e reproduzia funções da agência Dioli que não pertencem à operação interna da Foocci.

A planta oficial tem **6 departamentos**, e marketing não é um deles — a aquisição é executada pela Dioli.

## Por que estes arquivos continuam aqui

Apagá-los tiraria a trilha de por que a estrutura mudou. Decisão sem o porquê é decisão que se repete.

Eles ficam para auditoria. **Não são fonte para construir nada.**

## O que desta pasta continua valendo

O **código** que a v1 produziu é reaproveitado quase inteiro: identidade interna, RBAC, trilha de auditoria, ordem de serviço, tarefa e handoff atômico. O que mudou foi a planta que ele descreve, não o motor.

Os ADRs 001 a 006 continuam válidos, com uma emenda registrada na v3: onde o ADR-002 e o ADR-006 falam em "9 departamentos", leia-se 6.

## Onde está a arquitetura oficial

| Documento | Para quê |
| --- | --- |
| `../arquitetura-operacional-foocci-v3/00-README.md` | comece por aqui |
| `../arquitetura-operacional-foocci-v3/02-DEPARTAMENTOS-E-AGENTES.md` | o catálogo canônico |
