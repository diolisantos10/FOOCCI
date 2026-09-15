import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
describe("cold inbound policy",()=>{const s=readFileSync(fileURLToPath(new URL("./ColdLeadInboundPolicy.ts",import.meta.url)),"utf8");it("bot gate precede indicação",()=>expect(s.indexOf("interceptarAutomacaoAntesDoTA")).toBeLessThan(s.indexOf("processarIndicacaoExplicita(db")));});
