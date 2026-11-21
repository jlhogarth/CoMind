import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const port = Number(process.env.INTEGRITY_BROWSER_PORT ?? 3171);
const origin = "http://127.0.0.1:" + port;
let output = "";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1","--port",String(port)], {
  cwd: new URL("..",import.meta.url),
  env: process.env,
  stdio: ["ignore","pipe","pipe"],
});
server.stdout.on("data",chunk=>{output=(output+chunk).slice(-5000);});
server.stderr.on("data",chunk=>{output=(output+chunk).slice(-5000);});
let browser;
try {
  const deadline=Date.now()+90_000;
  let ready=false;
  while(Date.now()<deadline){
    if(server.exitCode!==null)throw new Error("Next server exited early: "+output);
    try {const response=await fetch(origin+"/integrations");if(response.ok){ready=true;break;}}catch{}
    await delay(500);
  }
  assert.ok(ready,"Next dev server unavailable: "+output);
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const page=await browser.newPage({viewport:{width:1250,height:920}});
  await page.goto(origin+"/integrations",{waitUntil:"domcontentloaded"});
  const link=page.getByRole("link",{name:"Open read-only Integrity projection"});
  assert.equal(await link.count(),1);
  assert.equal(await link.getAttribute("href"),"/integrity");
  await link.click();
  await page.getByRole("heading",{name:"Implementation Reality"}).waitFor({timeout:25000});
  assert.ok(new URL(page.url()).pathname==="/integrity");
  assert.equal(await page.getByRole("link",{name:"Implementation Integrity",exact:true}).count(),1);
  assert.equal(await page.getByText("Unbound",{exact:true}).count(),1);
  assert.equal(await page.getByText("Not established",{exact:true}).count(),1);
  assert.equal(await page.getByRole("heading",{name:"Source, freshness, and authority"}).count(),1);
  const body=await page.locator("main").innerText();
  assert.match(body,/Private source not connected to this route/);
  assert.match(body,/No status inferred/);
  assert.match(body,/not a live multi-source graph execution/);
  assert.match(body,/Production/);
  assert.ok(!body.includes("Production authorized"));
  if(process.env.INTEGRITY_BROWSER_SCREENSHOT){
    await mkdir(dirname(process.env.INTEGRITY_BROWSER_SCREENSHOT),{recursive:true});
    await page.screenshot({path:process.env.INTEGRITY_BROWSER_SCREENSHOT,fullPage:true});
  }
  console.log("PASS Integrity Console: navigation, read-only Test scope, source/authority boundaries, no false Production claim.");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await Promise.race([new Promise(resolve=>server.once("exit",resolve)),delay(5000)]);
  if(server.exitCode===null)server.kill("SIGKILL");
}
