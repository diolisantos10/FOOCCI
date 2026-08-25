/**
 * Gera o cookie de sessão interna para as capturas de evidência.
 *
 * Existe em `scripts/` e não em `/tmp` por um motivo prático: o `@/` do projeto
 * só resolve de dentro dele. Não é chamado por nada em produção.
 */
import { PrismaClient } from "@prisma/client";
import { criarCookieInterno } from "@/lib/internal-auth";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("uso: tsx scripts/_evidencia/cookie.ts <email>");

  const u = await prisma.internalUser.findUnique({
    where: { email },
    select: {
      id: true, nome: true, role: true,
      memberships: { select: { department: { select: { slug: true } }, isManager: true } },
    },
  });
  if (!u) throw new Error(`sem usuário ${email}`);

  const cookie = criarCookieInterno({
    userId: u.id,
    nome: u.nome,
    role: u.role,
    departamentos: u.memberships.map((m) => m.department.slug),
    gerencia: u.memberships.filter((m) => m.isManager).map((m) => m.department.slug),
  });

  // Só o par nome=valor: o resto do Set-Cookie não vai no cabeçalho Cookie.
  console.log(cookie.split(";")[0]);
}

main().finally(() => prisma.$disconnect());
