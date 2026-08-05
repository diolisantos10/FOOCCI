// Auxiliar de sessão: salva o log do job no scratchpad. Não é peça do produto.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync } from "node:fs";
const exec = promisify(execFile);
const T = process.env.GH_TOKEN;
const R = "diolisantos10/FOOCCI";
const raw = async (u) => (await exec("curl", ["-sSL", "-H", `Authorization: Bearer ${T}`, "-H", "Accept: application/vnd.github+json", u], { maxBuffer: 256e6 })).stdout;
const jobs = JSON.parse(await raw(`https://api.github.com/repos/${R}/actions/runs/${process.env.RUN}/jobs`));
const j = jobs.jobs[0];
const log = await raw(`https://api.github.com/repos/${R}/actions/jobs/${j.id}/logs`);
writeFileSync(process.env.SAIDA, log.split("\n").map((l) => l.replace(/^\S+Z /, "")).join("\n"));
console.log("linhas:", log.split("\n").length, "→", process.env.SAIDA);
