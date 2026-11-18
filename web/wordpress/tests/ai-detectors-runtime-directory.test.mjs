import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const clientUrl=new URL('../sherloq-browser/assets/tool-client.js',import.meta.url);
const assets=new URL('../sherloq-browser/assets/',import.meta.url);
const sha=data=>createHash('sha256').update(data).digest('hex');
async function actualClientConfiguration(){
 const source=await readFile(clientUrl,'utf8');
 const configure=source.match(/export (async function configureAiDetectors\([\s\S]*?\n\})/);
 const call=source.match(/await configureAiDetectors\(engine,\{\.\.\.configuration,modelBaseUrl:[^\n]+\},hooks\(\)\);/);
 assert.ok(configure&&call,'Exercise the actual client configuration and admission helper.');
 const manifest=await readFile(new URL('unified-assets/ai-detectors/model-manifest.json',assets));
 assert.equal(sha(manifest),'5a44db685d86d91f44b99585624dfd78c07b81e8b413fa4eb3c54846f9c36f9e');
 const configuration=JSON.parse(manifest),before=structuredClone(configuration);let admitted;
 const context=vm.createContext({URL,configuration,moduleUrl:clientUrl.href,asset:name=>new URL(name,new URL('unified-assets/',assets)).href,
  hooks:()=>({}),checkAbort(){},engine:{capabilities:async()=>({operations:[{id:'ai.generation.detect',configured:false}]}),loadAiDetectors:async value=>{admitted=value;}}});
 await vm.runInContext('(async()=>{'+configure[1]+';'+call[0].replaceAll('import.meta.url','moduleUrl')+'})()',context);
 assert.ok(admitted);assert.deepEqual(configuration,before,'Model identities and execution policies are unchanged.');
 assert.equal(admitted.models.gapl.sha256,'4c52c2f9aaa76d72d3aed0fd575e599e7764ad49611bb9a1b3320afde5176543');
 return admitted;
}

for(const spec of [
 {backend:'cpu',directory:'d2prl',module:'ort.wasm.min.mjs',pathKey:'ortWasmPaths',moduleKey:'ortModuleUrl',resolver:'Mn',base:'R',loader:'tn',pin:'219e6a1fc8a9938268d18efca3c91d310bd2f4a59bbd13744df5b2b7fc6cee3b'},
 {backend:'webgpu',directory:'segmentation',module:'ort.bounded-cache.min.mjs',pathKey:'ortGpuWasmPaths',moduleKey:'ortGpuModuleUrl',resolver:'H1',base:'lt',loader:'Ym',pin:'7d310c76aac719959f1b7ddfacd696d40d7b9a811d0ced1a68fb44a038a77cf4'}
])test('actual '+spec.backend+' client configuration resolves its pinned ORT factory inside the runtime directory',async()=>{
 const configuration=await actualClientConfiguration(),moduleUrl=new URL('unified-engine/vendor/'+spec.directory+'/'+spec.module,assets);
 assert.equal(configuration[spec.moduleKey],moduleUrl.href,'The runtime module URL is preserved.');
 assert.equal(configuration[spec.pathKey],new URL('./',moduleUrl).href);
 const runtime=await readFile(moduleUrl);assert.equal(sha(runtime),spec.pin);
 const text=runtime.toString(),start=text.indexOf(spec.resolver+'=');
 // Execute the exact URL resolver from the pinned shipped ORT, not a second
 // implementation of its new-URL semantics. Neither ORT nor Wasm is started.
 const resolver=text.slice(start).match(/^[^=]+=(\([^)]*\)=>\{[^}]*\}catch\{return\}\})/);
 assert.ok(start>=0&&resolver);const resolve=vm.runInNewContext('('+resolver[1]+')',{URL,[spec.base]:moduleUrl.href});
 const loader=text.slice(text.indexOf(spec.loader+'=async')).match(/let i="([^"]+\.mjs)"/);assert.ok(loader);
 const factoryUrl=new URL(resolve(loader[1],configuration[spec.pathKey]));
 assert.equal(new URL('./',factoryUrl).href,new URL('./',moduleUrl).href);
 assert.equal((await stat(factoryUrl)).isFile(),true);
 assert.equal((await stat(new URL(factoryUrl.href.replace(/\.mjs$/,'.wasm')))).isFile(),true);
 // A factory module exports a function; importing it does not invoke the
 // function, instantiate Wasm, load weights, create a GPU device or infer.
 const factory=await import(factoryUrl.href);assert.equal(typeof factory.default,'function');
});
