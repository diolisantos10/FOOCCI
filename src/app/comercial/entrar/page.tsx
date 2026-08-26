/**
 * A ENTRADA DA ÁREA COMERCIAL.
 *
 * ── POR QUE ELA EXISTE SEPARADA DA ENTRADA DO ADMIN ─────────────────────────
 *
 * A entrada do Admin abre a empresa inteira e por isso mostra as duas portas com
 * o mesmo peso: a da pessoa e a senha da casa. Aqui a proporção é outra — quase
 * todo mundo que chega é gente do atendimento, com e-mail e senha próprios. A
 * senha compartilhada continua funcionando (ela abre o que sempre abriu), mas
 * fica recolhida: quem entra pela primeira vez encontra o caminho certo primeiro.
 *
 * ── E POR QUE ELA FICA FORA DA MOLDURA ──────────────────────────────────────
 *
 * O layout de `/comercial` exige sessão e manda para cá quem não tem. Se esta
 * página vivesse dentro dele, o redireciono cairia em si mesmo — a pessoa veria
 * a barra do navegador piscando para sempre em vez de um campo de e-mail.
 */

import { EntrarClient } from "./EntrarClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar" };

export default function EntrarPage() {
  return <EntrarClient />;
}
