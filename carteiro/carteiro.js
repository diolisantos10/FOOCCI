/**
 * FOOCCI — Carteiro de Impressão (agente local) — v0.2
 * =====================================================
 *
 * Dois cliques no programa →
 *   1. sobe um servidorzinho local e abre o navegador com a tela do Carteiro;
 *   2. você PAREIA uma vez (cola o código que aparece no painel do FOOCCI);
 *   3. a partir daí ele fica perguntando ao FOOCCI "tem pedido pra imprimir?"
 *      e imprime cada um na impressora certa — automático, sem janela.
 *
 * A nuvem nunca alcança o PC: é sempre o Carteiro que vai até o FOOCCI (polling),
 * então atravessa qualquer rede/firewall só com internet normal de saída.
 *
 * Sem dependências externas (só Node + Windows + fetch nativo do Node).
 */

"use strict";

const http = require("http");
const { exec, execFile } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");

const VERSION = "0.2.1";
const PORT = 9999;
const HOST = "127.0.0.1";
const DEFAULT_BASE_URL = "https://foocci.com.br";
const POLL_MS = 4000;
const CONFIG_PATH = path.join(os.homedir(), ".foocci-carteiro.json");

// Mantém a janela aberta se algo travar ANTES do servidor subir (pra dar pra ler o erro).
let serverUp = false;
function fatal(err) {
  console.error("\n  *** ERRO ***\n  " + ((err && (err.stack || err.message)) || err) + "\n");
  if (!serverUp) {
    console.error("  (Tire um print desta tela e mande para o suporte.)\n");
    try {
      fs.readSync(0, Buffer.alloc(1), 0, 1, null);
    } catch {
      /* ignore */
    }
  }
}
process.on("uncaughtException", fatal);
process.on("unhandledRejection", fatal);

// ── Config (token + endereço do FOOCCI), guardado entre execuções ─────────────
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}
function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.log("  (aviso) não consegui salvar config:", e && e.message);
  }
}
let config = loadConfig(); // { baseUrl, token, restaurantName }

// ── Impressoras: o que o Windows já conhece ───────────────────────────────────
function parseLines(text) {
  return String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function listPrinters() {
  return new Promise((resolve) => {
    const psCmd = "Get-Printer | Select-Object -ExpandProperty Name";
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", psCmd],
      { windowsHide: true },
      (err, stdout) => {
        const names = !err ? parseLines(stdout) : [];
        if (names.length > 0) return resolve(names);
        exec("wmic printer get name", { windowsHide: true }, (e2, out2) => {
          if (e2 || !out2) return resolve([]);
          resolve(parseLines(out2).filter((l) => l.toLowerCase() !== "name"));
        });
      },
    );
  });
}

// ── Impressão: manda um texto qualquer pra uma impressora ─────────────────────
function printText(printerName, text) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), "foocci-carteiro-" + Date.now() + ".txt");
    fs.writeFile(tmp, String(text), { encoding: "utf8" }, (werr) => {
      if (werr) return reject(werr);
      const file = tmp.replace(/'/g, "''");
      const name = String(printerName).replace(/'/g, "''");
      const psCmd = "Get-Content -LiteralPath '" + file + "' | Out-Printer -Name '" + name + "'";
      execFile(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", psCmd],
        { windowsHide: true },
        (perr, _stdout, pstderr) => {
          if (perr) return reject(new Error(parseLines(pstderr).join(" ") || perr.message));
          resolve();
        },
      );
    });
  });
}

function buildTestTicket(printerName) {
  const now = new Date().toLocaleString("pt-BR");
  return [
    "================================",
    "       COMANDA DE TESTE",
    "            F O O C C I",
    "================================",
    "Impressora: " + printerName,
    "--------------------------------",
    "  2x  Yakisoba de Frango",
    "  1x  Coca-Cola Lata",
    "--------------------------------",
    now,
    "================================",
    "  Se voce esta lendo isso no",
    "  papel, a impressao FUNCIONOU!",
    "================================",
    "",
    "",
    "",
  ].join("\r\n");
}

// ── O cano: pergunta ao FOOCCI se tem pedido e imprime ────────────────────────
async function pollOnce() {
  if (!config.token || !config.baseUrl) return;
  let printers = [];
  try {
    printers = await listPrinters();
  } catch {
    /* segue mesmo sem lista */
  }
  let data;
  try {
    const r = await fetch(config.baseUrl + "/api/print-agent/poll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: config.token, printers, version: VERSION }),
    });
    data = await r.json();
  } catch {
    return; // sem internet no momento — tenta de novo no próximo ciclo
  }
  if (!data || !data.ok || !Array.isArray(data.jobs)) return;
  for (const job of data.jobs) {
    let ok = true;
    let errMsg = "";
    try {
      await printText(job.printerName, job.body);
      console.log("  [imprimiu] " + (job.title || job.id) + " -> " + job.printerName);
    } catch (e) {
      ok = false;
      errMsg = String((e && e.message) || e);
      console.log("  [falhou] " + (job.title || job.id) + ": " + errMsg);
    }
    try {
      await fetch(config.baseUrl + "/api/print-agent/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: config.token, jobId: job.id, ok, error: errMsg }),
      });
    } catch {
      /* o FOOCCI re-tenta no próximo poll se não receber o ack */
    }
  }
}

// ── Página (a interface local) ────────────────────────────────────────────────
const PAGE = [
  "<!doctype html>",
  '<html lang="pt-BR"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  "<title>FOOCCI — Carteiro</title>",
  "<style>",
  "*{box-sizing:border-box} body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#0f172a;color:#e2e8f0}",
  ".wrap{max-width:560px;margin:0 auto;padding:28px 20px 60px}",
  ".logo{font-weight:800;font-size:26px;letter-spacing:1px;color:#fff}.logo span{color:#f59e0b}",
  ".sub{color:#94a3b8;margin:6px 0 22px;font-size:14px}",
  ".card{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:18px;margin-bottom:14px}",
  ".row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #28344a}",
  ".row:last-child{border-bottom:0}",
  "label{display:block;font-size:13px;color:#94a3b8;margin:10px 0 5px}",
  "input{width:100%;padding:11px 12px;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:15px}",
  "button{background:#f59e0b;color:#1a1300;border:0;border-radius:10px;padding:11px 16px;font-size:14px;font-weight:700;cursor:pointer}",
  "button:hover{background:#fbbf24} button.ghost{background:#0f172a;color:#cbd5e1;border:1px solid #334155}",
  "button.small{padding:8px 12px;font-size:13px}",
  ".dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px}",
  ".ok{color:#86efac}.muted{color:#94a3b8}.err{color:#fca5a5}",
  "#msg{margin-top:10px;font-size:13px}",
  "</style></head><body><div class='wrap'>",
  "<div class='logo'>FOO<span>CCI</span> · Carteiro</div>",
  "<div class='sub'>Agente de impressão · v" + VERSION + "</div>",
  "<div id='app'><p class='muted'>Carregando…</p></div>",
  "</div>",
  "<script>",
  "var DEFAULT_BASE=" + JSON.stringify(DEFAULT_BASE_URL) + ";",
  "function h(s){return (s==null?'':String(s)).replace(/[&<>\"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c];});}",
  "async function getJSON(u,o){var r=await fetch(u,o);return await r.json().catch(function(){return{};});}",
  "async function refresh(){",
  " var st=await getJSON('/status');",
  " if(st.paired){renderConnected(st);}else{renderPairing(st);}",
  "}",
  "function renderPairing(st){",
  " var app=document.getElementById('app');",
  " app.innerHTML=",
  "  \"<div class='card'><p style='font-weight:700;margin:0 0 4px'>Parear com o FOOCCI</p>\"+",
  "  \"<p class='muted' style='margin:0 0 8px;font-size:13px'>No painel do FOOCCI, abra <b>Integra&ccedil;&otilde;es &rarr; Impress&atilde;o</b> e copie o c&oacute;digo de pareamento.</p>\"+",
  "  \"<label>Endere&ccedil;o do FOOCCI</label><input id='b' value='\"+h(st.baseUrl||DEFAULT_BASE)+\"'>\"+",
  "  \"<label>C&oacute;digo de pareamento</label><input id='c' placeholder='Ex: K7M2QP4A' style='text-transform:uppercase;letter-spacing:3px'>\"+",
  "  \"<div style='margin-top:14px'><button id='go'>Parear</button></div>\"+",
  "  \"<div id='msg'></div></div>\";",
  " document.getElementById('go').onclick=doPair;",
  "}",
  "async function doPair(){",
  " var b=document.getElementById('b').value.trim();var c=document.getElementById('c').value.trim();",
  " var msg=document.getElementById('msg');msg.innerHTML='<span class=muted>Pareando…</span>';",
  " var r=await getJSON('/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseUrl:b,code:c})});",
  " if(r.ok){msg.innerHTML='<span class=ok>Pareado! ✅</span>';setTimeout(refresh,600);}",
  " else{msg.innerHTML='<span class=err>'+h(r.error||'Falhou')+'</span>';}",
  "}",
  "async function renderConnected(st){",
  " var app=document.getElementById('app');",
  " var ps=await getJSON('/printers');var list=(ps.printers||[]);",
  " var rows=list.length?list.map(function(n){return \"<div class='row'><span>\"+h(n)+\"</span><button class='small ghost' onclick=\\\"testPrint('\"+h(n).replace(/'/g,\"\\\\'\")+\"',this)\\\">Imprimir teste</button></div>\";}).join(''):\"<p class='muted'>Nenhuma impressora encontrada.</p>\";",
  " app.innerHTML=",
  "  \"<div class='card'><p style='margin:0;font-weight:700'><span class='dot' style='background:#22c55e'></span>Conectado\"+(st.restaurantName?(' — '+h(st.restaurantName)):'')+\"</p>\"+",
  "  \"<p class='muted' style='margin:8px 0 0;font-size:13px'>Pode deixar este programa aberto (ou minimizado). Os pedidos do FOOCCI imprimem sozinhos na impressora certa.</p></div>\"+",
  "  \"<div class='card'><p style='margin:0 0 6px;font-weight:700'>Impressoras detectadas</p>\"+rows+\"</div>\"+",
  "  \"<button class='ghost small' id='unp'>Desconectar este PC</button><div id='msg'></div>\";",
  " document.getElementById('unp').onclick=async function(){await getJSON('/unpair',{method:'POST'});refresh();};",
  "}",
  "async function testPrint(name,btn){var old=btn.textContent;btn.disabled=true;btn.textContent='Imprimindo…';",
  " var r=await getJSON('/test-print',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({printer:name})});",
  " btn.disabled=false;btn.textContent=old;var msg=document.getElementById('msg');",
  " if(msg){msg.innerHTML=r.ok?\"<span class=ok>Enviado para \"+h(name)+\" ✅</span>\":\"<span class=err>\"+h(r.error||'erro')+\"</span>\";}",
  "}",
  "refresh();",
  "</script></body></html>",
].join("\n");

// ── Servidor local ────────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(b || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}
function json(res, obj, status) {
  res.writeHead(status || 200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(PAGE);
  }

  if (req.method === "GET" && req.url === "/status") {
    return json(res, {
      paired: !!config.token,
      baseUrl: config.baseUrl || DEFAULT_BASE_URL,
      restaurantName: config.restaurantName || null,
      version: VERSION,
    });
  }

  if (req.method === "GET" && req.url === "/printers") {
    return json(res, { printers: await listPrinters() });
  }

  if (req.method === "POST" && req.url === "/pair") {
    const body = await readBody(req);
    const baseUrl = String(body.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    const code = String(body.code || "").trim();
    if (!code) return json(res, { ok: false, error: "Informe o código." }, 400);
    try {
      const r = await fetch(baseUrl + "/api/print-agent/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairingCode: code }),
      });
      const data = await r.json().catch(() => ({}));
      if (data && data.ok && data.token) {
        config = { baseUrl, token: data.token, restaurantName: data.restaurantName || null };
        saveConfig(config);
        return json(res, { ok: true });
      }
      return json(res, { ok: false, error: (data && data.error) || "Código inválido." }, 400);
    } catch (e) {
      return json(res, { ok: false, error: "Não consegui falar com o FOOCCI (" + (e && e.message) + ")." }, 502);
    }
  }

  if (req.method === "POST" && req.url === "/unpair") {
    config = { baseUrl: config.baseUrl || DEFAULT_BASE_URL };
    saveConfig(config);
    return json(res, { ok: true });
  }

  if (req.method === "POST" && req.url === "/test-print") {
    const body = await readBody(req);
    const printer = String(body.printer || "");
    if (!printer) return json(res, { ok: false, error: "Impressora não informada." }, 400);
    try {
      await printText(printer, buildTestTicket(printer));
      return json(res, { ok: true });
    } catch (e) {
      return json(res, { ok: false, error: String((e && e.message) || e) }, 500);
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.log("\n  O Carteiro já parece estar aberto. Acesse http://localhost:" + PORT + "\n");
  } else {
    console.log("\n  Erro ao iniciar:", err && err.message, "\n");
  }
});

server.listen(PORT, HOST, () => {
  serverUp = true;
  const url = "http://localhost:" + PORT;
  console.log("");
  console.log("  ===========================================");
  console.log("   FOOCCI - Carteiro de Impressao  v" + VERSION);
  console.log("   Rodando! Se o navegador nao abrir: " + url);
  console.log("   Para fechar, feche esta janela.");
  console.log("  ===========================================");
  console.log("");
  exec('cmd /c start "" "' + url + '"', () => {});
  // Inicia o cano (só age depois de pareado).
  setInterval(() => {
    pollOnce().catch(() => {});
  }, POLL_MS);
});
