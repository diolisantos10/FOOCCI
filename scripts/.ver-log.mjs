// Auxiliar de sessão: imprime o log de um job da rodada. Não é peça do produto.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const T = process.env.GH_TOKEN;
const R = "diolisantos10/FOOCCI";
const raw = async (u) => (await exec("curl", ["-sSL", "-H", `Authorization: Bearer ${T}`, "-H", "Accept: application/vnd.github+json", u], { maxBuffer: 128e6 })).stdout;
const jobs = JSON.parse(await raw(`https://api.github.com/repos/${R}/actions/runs/${process.env.RUN}/jobs`));
for (const j of jobs.jobs ?? []) {
  console.log("=== JOB", j.name, j.conclusion);
  for (const s of j.steps ?? []) console.log("   -", s.name, s.conclusion);
  const log = await raw(`https://api.github.com/repos/${R}/actions/jobs/${j.id}/logs`);
  const linhas = log.split("\n").map((l) => l.replace(/^\S+Z /, ""));
  console.log(linhas.slice(Number(process.env.DE || 0), Number(process.env.ATE || 200)).join("\n"));
}
