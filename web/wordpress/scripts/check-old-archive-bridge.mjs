// Read-only existing archive; private temporary launcher and isolated browser.
// ORIGINAL_HTML, STAGED_ASSETS, BRIDGE_CHUNKS, BRIDGE_POLICY are required.
// PLAYWRIGHT_MODULE may point to an installed playwright/index.mjs.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const html=resolve(process.env.ORIGINAL_HTML),assets=resolve(process.env.STAGED_ASSETS),chunks=resolve(process.env.BRIDGE_CHUNKS),policy=resolve(process.env.BRIDGE_POLICY);
const config=JSON.parse((await readFile(html,'utf8')).match(/<script id="sherloq-offline-config" type="application\/json">(.*?)<\/script>/s)[1]);
const archive=resolve(dirname(html),config.archivePath),before=await stat(archive),base='http://127.0.0.1:'+config.port+'/'+config.token+'/';
const helper=fileURLToPath(new URL('../sherloq-browser/assets/offline-server.py',import.meta.url));
const playwright=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href:'playwright');
let processHelper,browser;
async function start(bridge){const native=bridge&&process.env.NATIVE_LAUNCHER;processHelper=spawn(native||'python3',native?['--no-browser']:[helper,html,'--no-browser',...(bridge?['--bridge-assets',assets,'--bridge-chunks',chunks,'--bridge-policy',policy]:['--read-only'])],{stdio:['ignore','pipe','pipe']});let errors='';processHelper.stderr.on('data',b=>errors+=b);await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Local helper did not become ready: '+errors)),120000);processHelper.stdout.on('data',b=>{if(String(b).includes('SHERLOQ local')){clearTimeout(timeout);resolve();}});processHelper.on('exit',code=>{clearTimeout(timeout);reject(Error('Local helper exited '+code+': '+errors));});});}
async function stop(){if(!processHelper)return;const process=processHelper;processHelper=null;await new Promise(resolve=>{process.once('exit',resolve);process.kill('SIGINT');});}
const proof={schema:'sherloq.old-archive-bridge-proof/1',mode:process.env.NATIVE_LAUNCHER?'native-read-only':'python-managed',oldVersion:config.version,archiveBytes:before.size,archiveCopied:false,userImagesUsed:false,externalRequests:[],pageErrors:[]};
try{
 await start(false);browser=await playwright.chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext(),page=await context.newPage();
 await context.route(url=>url.origin!==new URL(base).origin,route=>{proof.externalRequests.push(route.request().url());return route.abort();});page.on('pageerror',e=>proof.pageErrors.push(e.message));
 await page.goto(base+'app.html');await page.waitForSelector('[data-workspace-ready="true"]',{state:'attached',timeout:90000});proof.oldWorkspaceOpened=true;
 const saved=await page.evaluate(async()=>{
  const params={quality:88,scale:50,contrast:14,linear:false,grayscale:false},settings={schema:'sherloq.settings/1',profiles:[{id:'profile-preserved',name:'Profil de migration',operation:'ela.classic',params}],activeProfile:'profile-preserved',current:params,preferences:{navigationMode:'trackpad',theme:'dark',language:'fr',layout:'tile',computeProfile:'maximum',regionMode:'whole',favorite:true,showZones:true,toolsVisible:true,inspectorVisible:true,highlightNewFeatures:false}};
  localStorage.setItem('sherloq.settings',JSON.stringify(settings));const preferences={language:'fr',layout:'tile',theme:'dark',computeProfile:'maximum',navigationMode:'trackpad',toolsVisible:true,highlight:false,favorites:['ai.clones.d2prl','tampering.copyMove.sparse']};localStorage.setItem('sherloq.workspace.preferences',JSON.stringify(preferences));return{settings,preferences};
 });
 await page.goto('about:blank');await stop();await start(true);await page.goto(base+'app.html');await page.waitForSelector('[data-workspace-ready="true"]',{state:'attached',timeout:90000});
 assert.equal(await page.locator('#local-update-settings').count(),1);proof.updaterVisible=true;
 const restored=await page.evaluate(async()=>{const s=JSON.parse(localStorage.getItem('sherloq.settings')),preferences=JSON.parse(localStorage.getItem('sherloq.workspace.preferences')),policy=await(await fetch('__feature-policy.json')).json();return{settings:s,preferences,policy,isolated:crossOriginIsolated};});
 assert.equal(restored.settings.profiles.find(p=>p.id==='profile-preserved').params.quality,88);assert.deepEqual(restored.preferences.favorites,saved.preferences.favorites);assert.equal(restored.preferences.theme,'dark');assert.equal(restored.isolated,true);assert.deepEqual(restored.policy.disabledGroups,JSON.parse(await readFile(policy)).disabledGroups);
 proof.preferencesPreserved=true;proof.exclusionsPreserved=true;proof.sameOrigin=true;proof.isolated=true;
 proof.worker=await page.evaluate(async()=>{const {initializeLocalManagement}=await import('./local-management-ui.js'),management=await initializeLocalManagement();const state=await management.updater.ensureLocalControl();return{identity:state.active.identity,workerType:management.plan.shell.workerType,controller:navigator.serviceWorker.controller?.scriptURL};});
 assert.equal(proof.worker.workerType,'classic');assert.ok(proof.worker.controller?.includes('offline-browser-sw.js'));
 proof.gradient=await page.evaluate(async()=>{const {createWorkerEngine}=await import('./unified-engine/src/worker-client.js'),engine=createWorkerEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'single'});try{const data=Uint8Array.from({length:67*65*3},(_,i)=>i*29),source=await engine.load({id:'bridge-synthetic',bytes:Uint8Array.of(1),pixels:{width:67,height:65,format:'rgb8',data}}),gradient=await engine.run({id:'bridge-gradient',imageId:'bridge-synthetic',operation:'detail.gradient',params:{mode:3,equalize:false}}),output=gradient.surface?await engine.readPixels({surfaceId:gradient.surface.id,revision:gradient.surface.revision}):gradient;return{engineVersion:(await engine.capabilities()).version,status:gradient.status,bytes:output.pixels?.data?.length??0,sourceWidth:source.surface.width,error:gradient.error};}finally{await engine.dispose();}});
 assert.equal(proof.gradient.bytes,67*65*3);assert.equal(proof.gradient.sourceWidth,67);
 proof.inventory=await page.evaluate(async()=>await(await fetch('__managed/inventory')).json());assert.ok(proof.inventory.archiveResourceBytes>0);assert.ok((proof.inventory.managedResourceBytes??proof.inventory.bridgeBytes)<25_000_000);proof.offlineInternet=true;
 const removed=await page.evaluate(async()=>{const names=(await caches.keys()).filter(name=>name.startsWith('sherloq-offline-app-'));await Promise.all(names.map(name=>caches.delete(name)));return names;});assert.ok(removed.length);await page.reload();await page.waitForSelector('[data-workspace-ready="true"]',{state:'attached',timeout:90000});
 proof.cacheEvictionRecovery=await page.evaluate(async()=>{const {initializeLocalManagement}=await import('./local-management-ui.js'),management=await initializeLocalManagement(),prefs=JSON.parse(localStorage.getItem('sherloq.workspace.preferences'));return{identity:management.plan.identity,updaterVisible:!!document.getElementById('local-update-settings'),favorites:prefs.favorites};});assert.equal(proof.cacheEvictionRecovery.identity,proof.worker.identity);assert.equal(proof.cacheEvictionRecovery.updaterVisible,true);assert.deepEqual(proof.cacheEvictionRecovery.favorites,saved.preferences.favorites);
 const after=await stat(archive);assert.equal(after.size,before.size);assert.equal(after.mtimeMs,before.mtimeMs);proof.archiveUnchanged=true;
 assert.deepEqual(proof.externalRequests,[]);assert.deepEqual(proof.pageErrors,[]);proof.passed=true;
}catch(error){proof.passed=false;proof.error=error.stack;process.exitCode=1;}
finally{await browser?.close();await stop();}
console.log(JSON.stringify(proof,null,2));
