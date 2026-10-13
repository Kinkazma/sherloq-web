import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {sha256} from '../sherloq-browser/assets/dependency-core.js';
import {createOfflineLauncherDownload} from '../sherloq-browser/assets/offline-launcher-download.js';
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const enc=new TextEncoder(),token='a'.repeat(32);
async function fixture(base='http://127.0.0.1:8943/'+token+'/'){
 const helper=enc.encode('# Verified fixture helper\nprint("local")\n'),manifestBytes=enc.encode('{"schema":"sherloq.dependencies/1","slots":[],"files":{},"chunks":{}}\n'),meta={size:helper.length,sha256:await sha256(helper)},shell={schema:'sherloq.offline-shell/1',version:'0.18.0-local.1',manifest:await sha256(manifestBytes),files:{'app.html':meta,'workspace-entry.js':meta,'offline-server.py':meta}},shellBytes=enc.encode(JSON.stringify(shell)+'\n');
 return{plan:{shell,shellBytes,manifestBytes,identity:await sha256(shellBytes),appBase:new URL(base),sourceBase:new URL(base),local:true},helper};
}
function config(html){return JSON.parse(parseHTML(html).document.getElementById('sherloq-offline-config').textContent);}
test('matching HTML preserves an archive origin and binds the exact shell and manifest with a relative TAR name',async()=>{
 const f=await fixture(),generated=await createOfflineLauncherDownload(f.plan,{language:'en',storage:null,fetcher:async()=>new Response(f.helper)}),value=config(generated.html);assert.deepEqual(value,generated.config);assert.equal(value.archivePath,'SHERLOQ-complet.tar');assert.equal(value.shellSha256,f.plan.identity);assert.equal(value.manifest,f.plan.shell.manifest);assert.equal(value.version,'0.18.0-local.1');assert.equal(value.port,8943);assert.equal(value.token,token);assert.match(generated.html,/lang="en"/);assert.match(generated.html,new RegExp('http://127.0.0.1:8943/'+token+'/app.html'));assert.ok(generated.html.includes('Verified fixture helper'));assert.ok(!generated.html.includes('bridge-launch.json'));
});
test('a PWA/site scope generates a new independent token on port 8765',async()=>{
 const f=await fixture('https://site.test/assets/offline/');f.plan.local=false;const generated=await createOfflineLauncherDownload(f.plan,{storage:null,fetcher:async()=>new Response(f.helper),crypto:{getRandomValues:bytes=>(bytes.fill(17),bytes)}});assert.equal(generated.config.port,8765);assert.equal(generated.config.token,'11'.repeat(16));assert.ok(!generated.html.includes('site.test'));assert.equal(generated.config.archivePath,'SHERLOQ-complet.tar');
});
test('a modern exported shell opens its bootstrap while legacy shells retain their ordinary app link',async()=>{
 const f=await fixture();f.plan.shell.files['offline-bridge.html']=f.plan.shell.files['app.html'];f.plan.shellBytes=enc.encode(JSON.stringify(f.plan.shell)+'\n');f.plan.identity=await sha256(f.plan.shellBytes);const generated=await createOfflineLauncherDownload(f.plan,{storage:null,fetcher:async()=>new Response(f.helper)});assert.match(generated.html,new RegExp('http://127.0.0.1:8943/__sherloq_bridge/'+token+'/offline-bridge.html'));assert.equal(generated.config.shellSha256,f.plan.identity);
});
test('verified cached helper works offline and a same-size corrupted helper never produces an HTML',async()=>{
 const f=await fixture(),storage={async open(){return{async match(){return new Response(f.helper);}};}},generated=await createOfflineLauncherDownload(f.plan,{storage,fetcher:()=>assert.fail('verified cache should be enough')});assert.equal(generated.config.shellSha256,f.plan.identity);
 const bad=f.helper.slice();bad[0]^=1;await assert.rejects(createOfflineLauncherDownload(f.plan,{storage:null,fetcher:async()=>new Response(bad)}),/SHA-256 or size differs/);
});
test('changed shell or manifest metadata reject before fetching a helper',async()=>{
 const f=await fixture();await assert.rejects(createOfflineLauncherDownload({...f.plan,identity:'b'.repeat(64)},{storage:null,fetcher:()=>assert.fail('shell mismatch must fail first')}),/shell identity differs/);await assert.rejects(createOfflineLauncherDownload({...f.plan,manifestBytes:enc.encode('{}')},{storage:null,fetcher:()=>assert.fail('manifest mismatch must fail first')}),/manifest identity differs/);
});
test('literal installer DOM exposes the translated matching-HTML button and its handler downloads the verified pair',async()=>{
 const f=await fixture(),html=await readFile(new URL('../sherloq-browser/assets/offline-setup.html',import.meta.url),'utf8'),source=await readFile(new URL('../sherloq-browser/assets/offline-setup.js',import.meta.url),'utf8'),{document,window}=parseHTML(html),downloads=[];
 const context=vm.createContext({document,window,URL,URLSearchParams,TextEncoder,TextDecoder,Response,console,location:{hash:'',search:''},localStorage:{getItem:()=>null},navigator:{language:'fr',languages:['fr'],serviceWorker:{addEventListener(){},getRegistration:async()=>null}},caches:{},offlinePlan:async()=>f.plan,offlineMissing:async()=>[],OFFLINE_CHUNKS:'chunks',downloadDependencyArchive(){},indexResourceTar(){},discoverBrowserInstallation:async()=>({plan:f.plan}),prepareBrowserInstallation(){},stageBrowserInstallationShell(){},installationWorkerURL(){},updateWorkerMessage(){},readVerifiedResponse(){},normalizeFeatureState:()=>({}),requiredFeatureChunks:()=>new Map(),renderOfflineFeatureChoices:()=>({render(){},setLocked(){}}),capturePreferenceBackup(){},downloadPreferenceBackup(){},adobeFontURL:()=>null,fetch:async()=>new Response(JSON.stringify({complete:false})),createOfflineLauncherDownload:(plan,options)=>createOfflineLauncherDownload(plan,{...options,storage:null,fetcher:async()=>new Response(f.helper)}),downloadOfflineLauncher:(_document,value)=>downloads.push(value)});
 await vm.runInContext('(async()=>{'+source.replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(f.plan.appBase+'offline-setup.js'))+'})()',context);
 const button=document.getElementById('download-launcher');assert.equal(button.hidden,false);assert.equal(button.disabled,false);assert.equal(button.textContent,'Télécharger le HTML correspondant');await button.onclick();assert.equal(downloads.length,1);assert.equal(config(downloads[0]).shellSha256,f.plan.identity);assert.match(document.getElementById('status').textContent,/même dossier/);document.getElementById('language').onclick();assert.equal(button.textContent,'Download the matching HTML');assert.match(document.getElementById('archive-pair-info').textContent,/SHERLOQ-complet.tar/);
});
