import {describe,expect,it} from "vitest";
import {extrairContatoIndicadoNoTexto} from "./referredDecisionMakerFromText";
describe("referral safety",()=>{it("recusa texto sem indicação",()=>expect(extrairContatoIndicadoNoTexto("nosso telefone é 11 99999-1234")).toBeNull());});
