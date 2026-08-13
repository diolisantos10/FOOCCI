# Oficina — segurança

> Append-only. O agente escreve aqui; quem promove para a vitrine é o Diretor.

## 2026-08-13 — O caminho de recuperação de acesso (`/recover`, `/api/recover`, `reset-owner`)

**Padrão 2 do meu manual ("id aceito sem conferir de quem é") apareceu na forma mais
barata de todas: `findFirst({ isActive: true })`.** Não é um id que veio do atacante
— é *nenhum* id. A rota escolhia o inquilino sozinha, e "o primeiro ativo" é o que o
Postgres devolver naquele dia. Estava em DOIS lugares do mesmo caminho:

- `POST /api/recover` (pública, isenta no middleware) criava conta **OWNER** no
  restaurante sorteado, desde que ele estivesse sem dono ativo. Dono desativado ou
  tenant recém-criado = qualquer pessoa da internet virava proprietária dele. O
  limite de 5 tentativas/5min não protege: a primeira já bastava.
- `POST /api/admin/reset-owner` apagava as contas do restaurante sorteado — bomba
  sem mira: o operador pedia A e o banco podia entregar B.

**A trava:** recuperação só existe no estado de instalação inequívoco (UM restaurante
no banco, ativo, sem dono ativo); a rota de operador exige alvo escrito (`restaurantSlug`),
confirmação e cabeçalho `x-admin-secret` (cookie de sessão NÃO abre ação irreversível).

### As três lições que quero levar para o próximo projeto

1. **Lógica de "um restaurante só" sobrevive escondida em produto multi-inquilino.**
   O jeito de achar é grep por `findFirst` sem `where` de tenant, não leitura de
   rota por rota. Vale varrer o repositório inteiro atrás desse padrão.
2. **Tela destrutiva ao alcance do usuário é P0 mesmo quando a API está trancada.**
   Aqui a API exigia o segredo e a tela nem o mandava — então o botão só sabia fazer
   duas coisas: assustar ou, no dia em que alguém "consertasse" o `fetch`, destruir.
   A distância entre as duas era uma linha de código.
3. **Guardrail 4 na prática:** tirar o botão não basta, porque a próxima refatoração
   o traz de volta. O que segura é o portão estrutural
   (`src/security/recoveryPathGuard.test.ts`): nenhuma tela do navegador pode
   referenciar `/api/admin/reset-owner`.

### O que ficou aberto (não é meu para decidir)

Não existe redefinição de senha por e-mail — e **não construí**, porque não há serviço
de e-mail configurado (`RESEND_API_KEY` ausente no Railway, `docs/pendencias.md`).
Fluxo que depende de e-mail que não sai troca um beco sem saída por outro, mais
silencioso. O canal de socorro do login está construído e **apagado** até alguém
publicar um número/caixa (`NEXT_PUBLIC_SUPPORT_WHATSAPP` / `NEXT_PUBLIC_SUPPORT_EMAIL`):
qual número vai ao ar é decisão de dono, não de código.
