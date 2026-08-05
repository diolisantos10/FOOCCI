// Auxiliar de sessão: acompanha a rodada do workflow do raio-x. Não é peça do produto.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const T = process.env.GH_TOKEN;
const R = "diolisantos10/FOOCCI";
const c = async (u) => JSON.parse((await exec("curl", ["-sSL", "-H", `Authorization: Bearer ${T}`, "-H", "Accept: application/vnd.github+json", u], { maxBuffer: 64e6 })).stdout);
const d = await c(`https://api.github.com/repos/${R}/actions/runs?branch=${process.env.BRANCH}&per_page=10`);
for (const r of d.workflow_runs ?? []) console.log(r.id, r.name, "|", r.status, r.conclusion, r.created_at);
