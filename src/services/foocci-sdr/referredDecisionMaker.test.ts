import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("referred decision maker contract",()=>{
 const src=readFileSync(fileURLToPath(new URL("./referredDecisionMaker.ts",import.meta.url)),"utf8");
 it("não herda consentimento",()=>expect(src).toContain("consentAt:null"));
 it("não nasce qualificado",()=>expect(src).toContain('stage:"DISPONIVEL_PARA_PROSPECCAO"'));
 it("preserva a indicação na auditoria",()=>expect(src).toContain("indicado pelo lead"));
});
