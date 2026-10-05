// Real installed WordPress assets; separate browser/process from the 96 MP run.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(new URL('../../web-engine-integration/package.json',import.meta.url));
const {chromium}=require('playwright');
const output=path.resolve(process.env.SHERLOQ_UI_PROOF_DIR||'verification/automatic');await fs.mkdir(output,{recursive:true});
const proof={startedAt:new Date().toISOString(),checks:[],errors:[]};
const check=(name,pass,details)=>{proof.checks.push({name,pass,details});console.log(JSON.stringify({check:name,pass}));if(!pass)throw Error(name);};
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
const page=await context.newPage();page.on('pageerror',error=>proof.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')proof.errors.push(message.text().slice(0,1500));});
const observation=setInterval(()=>page.locator('#automatic-groups').textContent().then(groups=>console.log(JSON.stringify({at:new Date().toISOString(),groups}))).catch(()=>{}),30000);
try{
 await page.goto('http://127.0.0.1:8097/wp-content/plugins/sherloq-browser/assets/app.html?v=0.5.0-ui-check#lang=fr',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof document.querySelector('#tab-automatic')?.onclick==='function');
 const environment=await page.evaluate(()=>({isolated:crossOriginIsolated,sab:typeof SharedArrayBuffer!=='undefined',cores:navigator.hardwareConcurrency,secure:isSecureContext}));proof.environment=environment;check('Installed workspace has shared-memory isolation',environment.isolated&&environment.sab,environment);
 await page.locator('#tab-automatic').click();
 const bytes=await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const c=canvas.getContext('2d'),im=c.createImageData(256,256);let state=22;for(let i=0;i<im.data.length;i+=4){state=(1664525*state+1013904223)>>>0;im.data[i]=state&255;im.data[i+1]=(state>>>8)&255;im.data[i+2]=(state>>>16)&255;im.data[i+3]=255;}c.putImageData(im,0,0);c.drawImage(canvas,16,16,80,80,140,145,80,80);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));return [...new Uint8Array(await blob.arrayBuffer())];});
 await page.locator('#file').setInputFiles({name:'ui-regression-256.jpg',mimeType:'image/jpeg',buffer:Buffer.from(bytes)});
 await page.waitForFunction(()=>!document.querySelector('#automatic-run').disabled,{},{timeout:120000});
 check('Original loaded through integrated worker',await page.locator('#file-info').textContent().then(s=>s.includes('256 × 256')));
 await page.locator('#automatic-scope').selectOption('whole');
 await page.locator('#automatic-run').click();
 await page.waitForFunction(()=>document.querySelector('#automatic-groups').textContent.includes('PatchMatch')&&document.querySelector('#automatic-groups').textContent.includes('En cours'),{},{timeout:180000});
 await page.locator('#automatic-pause').click();
 await page.waitForFunction(()=>!document.querySelector('#automatic-resume').disabled,{},{timeout:180000});
 check('Real cooperative pause exposes resume',true,{status:await page.locator('#status').textContent()});
 await page.screenshot({path:path.join(output,'paused.png'),fullPage:true});
 await page.locator('#automatic-resume').click();
 await page.waitForFunction(()=>!document.querySelector('#automatic-export').disabled&&!document.querySelector('#automatic-run').disabled,{},{timeout:1200000});
 const meta=await page.locator('#provenance').textContent();proof.result=JSON.parse(meta);check('All five real groups completed after resume',Object.values(proof.result.state.states).every(s=>s==='done'),proof.result.state);
 const before=await page.locator('#zoom').textContent();await page.locator('#automatic-opacity').fill('35');await page.locator('#automatic-opacity').dispatchEvent('change');
 await page.locator('#automatic-source').selectOption('D2PRL');await page.waitForFunction(()=>!document.querySelector('#automatic-source').disabled,{},{timeout:60000});
 check('Filter and opacity preserve viewport',before===await page.locator('#zoom').textContent());
 const download=page.waitForEvent('download',{timeout:180000});await page.locator('#automatic-export').click();await(await download).saveAs(path.join(output,'automatic.npz'));
 check('Full NPZ downloaded',(await fs.stat(path.join(output,'automatic.npz'))).size>1000);
 await page.screenshot({path:path.join(output,'completed.png'),fullPage:true});
 await page.locator('#tab-ela').click();await page.waitForFunction(()=>!document.querySelector('#export-png').disabled&&!document.querySelector('#run').disabled,{},{timeout:120000});check('ELA still computes after releasing automatic session',true);
 check('No unhandled browser error',proof.errors.length===0,proof.errors);proof.passed=true;
}catch(error){proof.passed=false;proof.failure={message:error.message,stack:error.stack};proof.lastStatus=await page.locator('#status').textContent().catch(()=>null);proof.groups=await page.locator('#automatic-groups').textContent().catch(()=>null);await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{clearInterval(observation);proof.finishedAt=new Date().toISOString();await fs.writeFile(path.join(output,'proof.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));await browser.close();}
