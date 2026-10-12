// Browser regression for failed module graphs and dependency preparation.
// A minimal fixture isolates startup recovery; this does not qualify engines.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const assets=new URL('../sherloq-browser/assets/',import.meta.url);
const counts=new Map(),cases=['bootstrap-import','workspace-import','dependencies','mount'];
const server=http.createServer(async(req,res)=>{
 try{
  const [scenario,name]=new URL(req.url,'http://localhost').pathname.slice(1).split('/');
  if(!cases.includes(scenario)||!name||name.includes('..')){res.writeHead(404).end();return;}
  const key=scenario+'/'+name,count=(counts.get(key)||0)+1;counts.set(key,count);
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type',name.endsWith('.html')?'text/html':'text/javascript');
  if(name==='app.html')return res.end('<html lang="fr"><body><div id="startup-notice"></div><main id="workspace-app"></main><script type="module" src="workspace-entry.js"></script></body></html>');
  if((scenario==='bootstrap-import'&&name==='dependency-bootstrap.js'||scenario==='workspace-import'&&name==='unavailable.js')&&count===1)return res.writeHead(503).end('Temporary module failure');
  if(name==='dependency-bootstrap.js')return res.end(scenario==='dependencies'?'let attempts=0;export async function prepareDependencies(){if(++attempts<=3)throw Error("Temporary preparation failure");}':'export async function prepareDependencies(){}');
  if(name==='unavailable.js')return res.end('export const loaded=true;');
  if(name==='workspace.js')return res.end((scenario==='workspace-import'?'import "./unavailable.js";':'')+'export function mountWorkspace(){'+(scenario==='mount'?'if(!sessionStorage.getItem("mount-attempted")){sessionStorage.setItem("mount-attempted","yes");throw Error("Partial mount failure");}':'')+'document.getElementById("workspace-app").textContent="Workspace ready";}');
  res.end(await fs.readFile(new URL(name,assets)));
 }catch(error){res.writeHead(500).end(error.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port+'/',results=[];
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const scenario of cases){
  const context=await browser.newContext(),page=await context.newPage();
  try{
   await page.goto(base+scenario+'/app.html#lang=fr');
   const reload=scenario!=='dependencies',button=page.getByRole('button',{name:reload?'Recharger':'Réessayer',exact:true});
   await button.waitFor({timeout:15000});
   assert.equal(await page.locator('#workspace-app').getAttribute('inert'),'');
   assert.equal(await page.locator('[data-workspace-ready="true"]').count(),0);
   // There must be a deliberate recovery action, not an automatic reload loop.
   assert.equal(counts.get(scenario+'/app.html'),1);
   await button.click();
   await page.locator('[data-workspace-ready="true"]').waitFor({state:'attached',timeout:15000});
   assert.equal(await page.locator('#workspace-app').textContent(),'Workspace ready');
   assert.equal(await page.locator('#workspace-app').getAttribute('inert'),null);
   assert.equal(await page.locator('#startup-notice').count(),0);
   assert.equal(counts.get(scenario+'/app.html'),reload?2:1);
   if(scenario==='workspace-import')assert.equal(counts.get(scenario+'/unavailable.js'),2);
   if(scenario==='bootstrap-import')assert.equal(counts.get(scenario+'/dependency-bootstrap.js'),2);
   results.push({scenario,action:reload?'reload':'retry',recovered:true,documentLoads:counts.get(scenario+'/app.html')});
  }finally{await context.close();}
 }
 const proof={schema:'sherloq.startup-check/1',scope:'Real Chrome module cache and startup buttons; minimal fixture, no image or model inference',browser:browser.version(),results};
 const output=path.resolve('.build/user-journey-chrome/startup-proof.json');
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(proof,null,2)+'\n');
 console.log(JSON.stringify(proof));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
