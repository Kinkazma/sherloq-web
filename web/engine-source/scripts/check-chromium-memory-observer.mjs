// Development evidence on a real dedicated worker; no production capacity test.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createChromiumMemoryObserver} from './chromium-memory-observer.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});let observer;
try{
 const page=await browser.newPage();await page.goto('about:blank');
 await page.evaluate(()=>new Promise(resolve=>{globalThis.computeWorker=new Worker(URL.createObjectURL(new Blob(['globalThis.values=new Uint8Array(128*1024); onmessage=()=>postMessage(++values[0]); postMessage(0);'],{type:'text/javascript'})));computeWorker.onmessage=resolve;}));
 observer=await createChromiumMemoryObserver(browser);const first=await observer.sample('qualification-before');
 assert.ok(first.counters.some(c=>c.type==='page'&&Number.isFinite(c.usedSize)));assert.ok(first.counters.some(c=>c.type==='worker'&&c.backingStorageSize>=128*1024));assert.ok(first.processes.some(p=>p.type==='renderer'&&Number.isFinite(p.cpuTime)));
 await observer.close();observer=null;
 const progress=await page.evaluate(()=>new Promise(resolve=>{computeWorker.onmessage=event=>resolve(event.data);computeWorker.postMessage('continue');}));assert.equal(progress,1,'Detach must leave computation alive');
 console.log(JSON.stringify({passed:true,browser:browser.version(),sample:first,progressAfterDetach:progress,productionPreflightExecutions:0}));
}finally{await observer?.close();await browser.close();}
