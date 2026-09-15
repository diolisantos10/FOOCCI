import {describe,expect,it} from "vitest";
import {extrairContatoIndicadoNoTexto} from "./referredDecisionMakerFromText";
describe("referral text",()=>{
 it("extrai indicação explícita",()=>expect(extrairContatoIndicadoNoTexto("Fala com Maria 11 99999-1234, ela é do comercial")).toMatchObject({telefone:"11 99999-1234"}));
 it("não transforma telefone solto em decisor",()=>expect(extrairContatoIndicadoNoTexto("11 99999-1234")).toBeNull());
});
