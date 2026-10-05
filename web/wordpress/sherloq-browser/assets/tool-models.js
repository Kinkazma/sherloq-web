import {createM2WorkerClient} from './unified-engine/src/m2-worker-client.js';
const root=new URL('./individual-assets/',import.meta.url),shared=new URL('./unified-assets/',import.meta.url);
const url=name=>new URL(name,root).href,common=name=>new URL(name,shared).href;
async function json(path){const response=await fetch(path);if(!response.ok)throw Error('Dépendance indisponible : '+path);return response.json();}
export async function individualModels(){return json(url('individual-models.json'));}
export async function m2ToolClient({method,memoryBudgetBytes,computeProfile}){
 const runtime=await json(common('neural-runtime/manifest.json'));
 const runtimes=Object.fromEntries(Object.entries(runtime.providers).map(([provider,m])=>[provider,{factoryUrl:common('neural-runtime/'+m.factory),ortUrl:common('ort/ort.'+(provider==='wasm'?'wasm':'webgpu')+'.min.mjs'),wasmUrl:common('ort/'+m.wasm)}]));
 const segments=async folder=>{const m=await json(url(folder+'/manifest.json'));return {...m,assets:Object.fromEntries(Object.entries(m.assets).map(([key,a])=>[key,{...a,url:url(folder+'/'+a.file)}]))};};
 let configuration;
 if(method==='cfa'){const manifest=await json(url('cfa-m2/program-manifest.json'));configuration={assets:Object.fromEntries(manifest.models.map(m=>[m.variant,{...m.weights,url:url('cfa-m2/'+m.weights.file),checkpointSha256:m.checkpointSha256,program:{...m.program,url:url('cfa-m2/'+m.program.file)}}])),runtimes:{wasm:{executor:'cfa',factoryUrl:url('cfa-m2/operators.mjs'),wasmUrl:url('cfa-m2/operators.wasm')}}};}
 if(method==='catnet')configuration={segments:await segments('catnet-segments'),runtimes,jpegFactoryUrl:url('catnet/jpeg.mjs')};
 if(method==='trufor'){const npp=await json(url('trufor-npp/native-manifest.json'));configuration={segments:await segments('trufor-split-value'),runtimes,noiseprint:{asset:{...npp.weights,url:url('trufor-npp/'+npp.weights.file),program:{...npp.program,url:url('trufor-npp/'+npp.program.file)}},runtime:{executor:'noiseprint-plus',factoryUrl:url('cfa-m2/operators.mjs'),wasmUrl:url('cfa-m2/operators.wasm')}}};}
 return createM2WorkerClient({memoryBudgetBytes,computeProfile,methods:{[method]:configuration}});
}
