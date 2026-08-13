import { chromium } from "playwright-core";
const OUT="/tmp/claude-0/-home-user-FOOCCI/b9c343fc-6047-5924-8ea8-b9312faba7f6/scratchpad/shots";
const b = await chromium.launch({ args: ["--autoplay-policy=user-gesture-required"] });
for (const [w,h,tag] of [[375,780,"375"],[768,1024,"768"],[1280,900,"1280"]]) {
  const ctx = await b.newContext({ viewport:{width:w,height:h} });
  const p = await ctx.newPage();
  await p.goto("http://localhost:3000/login",{waitUntil:"networkidle"});
  await p.fill('input[type="email"]',"owner@pizzaria-demo.com");
  await p.fill('input[type="password"]',"demo1234");
  await p.locator("form button[type=submit]").click();
  await p.waitForURL(u=>!u.pathname.includes("/login"),{timeout:60000}).catch(()=>{});
  let n = 0;
  await ctx.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === "/api/orders") {
      n++;
      return route.fulfill({ status:200, contentType:"application/json", body: JSON.stringify({
        data: { data: [{ id:"ped-mudo-1", status:"PENDING", createdAt:new Date().toISOString(), payment:null }] } }) });
    }
    return route.continue();
  });
  await p.goto("http://localhost:3000/dashboard?painel=1",{waitUntil:"domcontentloaded"});
  await p.waitForTimeout(12000);
  const diag = await p.evaluate(() => localStorage.getItem("foocci_order_alert_diag"));
  const chip = p.locator("header button", { hasText: "Ativar som" });
  const visivel = await chip.isVisible().catch(()=>false);
  console.log(tag, "| pedidos servidos:", n, "| aviso visivel:", visivel);
  console.log(tag, "| diag:", diag);
  await p.locator("header").screenshot({ path: `${OUT}/som-mudo-${tag}.png` });
  if (visivel) { await chip.click(); await p.waitForTimeout(2000);
    console.log(tag, "| depois do toque:", await chip.isVisible().catch(()=>false)); }
  await ctx.close();
}
await b.close();
