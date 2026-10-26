import "../../runtime-context.js?v=0.25.0";
// Useful native CPU work only. One unchanged 512MiB/one-thread runtime per lane.
import {deriveMgcfdnProductEncoder} from './mgcfdn-product-encoder.js';
import {rewriteMgcfdnGlobalHead,MGCFDN_BASE_SHA256} from './mgcfdn-global-head-graph.js';
let config,ort,runtime,session,label,head,base,tail=Promise.resolve(),calls=0,peakHeap=0;
const HEAD_PINS={"normalize":{"bytes":1951,"sha256":"7f1888d9efc09f3931bd369357114a393394a7f2dd66f0a4aefd6f6a2e042a92"},"global-consistency":{"bytes":9374,"sha256":"c5741f98b4da0cc5b30f76de74b54785f1656dd930440e3a6e9fb1a81b941253"},"global-pools":{"bytes":10113,"sha256":"80e543a43d6ecc1d6bdbe9ca4513e92d9f35ba306c1a0b9fe07cbdd4e26e863e"},"context-f3":{"bytes":20425698,"sha256":"98b13e34ef23eea69a9364b56cbba39c7edf95fab04d2a23b1e62c141081db3b"},"global-attention":{"bytes":440,"sha256":"44d4fbc452bd63f607d89442993db650ab2f011232ffd8aed310c54e632540c0"},"context-decode":{"bytes":8317779,"sha256":"4e62751814f473533cea5674ef8aaae32d05c37e71a25fc7bd2f1fea0e4def5c"}};
const jobs=new Map(),LIMIT=512*1024**2,stages=new Set(['normalize','global-consistency','global-pools','context-f3','global-attention','context-decode']);
const pins={full:{bytes:89060850,sha256:MGCFDN_BASE_SHA256},encoder:{bytes:60269275,sha256:'0d8e0ec04111c3ec2cab7f5b1b9bb9145c477283a13fbca58a5627b484cf346c'}};
const assert=(v,m)=>{if(!v)throw Error(m);},sha=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(v=>v.toString(16).padStart(2,'0')).join('');
async function fetchPinned(url,pin){const response=await fetch(url);assert(response.ok&&response.body,'Native MGCFDN response unavailable');const data=new Uint8Array(pin.bytes),reader=response.body.getReader();let at=0;try{while(true){const{done,value}=await reader.read();if(done)break;assert(at+value.length<=data.length,'Native MGCFDN exceeds pin');data.set(value,at);at+=value.length;}}finally{await reader.cancel();reader.releaseLock();}assert(at===pin.bytes&&await sha(data)===pin.sha256,'Native MGCFDN pin mismatch');return data;}
async function graph(which){
 if(!base)base=await fetchPinned(config.modelUrl,pins.full);
 if(which==='full')return base;
 if(which==='encoder'){const value=deriveMgcfdnProductEncoder(base).bytes;assert(value.length===pins.encoder.bytes&&await sha(value)===pins.encoder.sha256,'Derived native encoder pin differs');return value;}
 assert(stages.has(which),'Unknown MGCFDN native stage');
 if(!head){let held=0;head=await rewriteMgcfdnGlobalHead(base,{budget:{reserve(bytes){held+=bytes;assert(held<=3*pins.full.bytes,'Native graph byte envelope exceeded');let live=true;return()=>{if(live){live=false;held-=bytes;}};}}});}
 const stage=head.stages.find(s=>s.label===which),pin=HEAD_PINS[which];assert(stage.bytes.length===pin.bytes&&await sha(stage.bytes)===pin.sha256,'Derived MGCFDN graph pin differs');return stage.bytes;
}
async function retire(job){let failed=false,first;for(const t of [...job.native])try{await t.dispose();job.native.delete(t);}catch(e){if(!failed){failed=true;first=e;}}if(failed)throw first;jobs.delete(job.id);}
async function execute(m){
 const{id,type}=m;
 if(type==='init'){assert(!config&&m.config.modelSha256===MGCFDN_BASE_SHA256&&m.config.precision==='float32'&&m.config.side===256&&m.config.featureSide===40&&m.config.topk===40,'Native base MGCFDN policy differs');config=m.config;self.postMessage({id,ok:true,ready:true,learnedCalls:0});return;}
 assert(config,'Uninitialized MGCFDN lane');
 if(type==='retire'){const job=jobs.get(m.jobId);if(job)await retire(job);self.postMessage({id,ok:true,retired:true});return;}
 if(type==='close'){let failed=false,first;for(const j of [...jobs.values()])try{await retire(j);}catch(e){if(!failed){failed=true;first=e;}}if(failed)throw first;if(session){await session.release();session=undefined;}head?.dispose();head=undefined;base=undefined;self.postMessage({id,ok:true,closed:true,calls,peakHeap});self.close();return;}
 assert(type==='run','Unknown MGCFDN job');
 if(!ort){runtime=await import(config.runtimeFactoryUrl);ort=await import(config.ortUrl);ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths=config.wasmPaths;}
 if(label!==m.label){if(session){await session.release();session=undefined;}session=await ort.InferenceSession.create(await graph(m.label),{executionProviders:['wasm'],graphOptimizationLevel:'disabled',enableCpuMemArena:false,enableMemPattern:false});label=m.label;}
 const job={id,native:new Set()},feeds={};jobs.set(id,job);
 for(const[name,t]of Object.entries(m.feeds)){const v=new ort.Tensor('float32',t.data,t.dims);job.native.add(v);feeds[name]=v;}
 const outputs=await session.run(feeds);calls++;for(const v of Object.values(outputs))job.native.add(v);
 const copied={};for(const[name,t]of Object.entries(outputs))if(t.type==='float32'){copied[name]={data:new Float32Array(t.data),dims:[...t.dims]};}
 const heapBytes=runtime.heapBytes();peakHeap=Math.max(peakHeap,heapBytes);assert(Number.isInteger(heapBytes)&&heapBytes<=LIMIT,'Native MGCFDN 512MiB heap ceiling exceeded');await retire(job);
 self.postMessage({id,ok:true,outputs:copied,metrics:{calls,peakHeap,numThreads:1,precision:'float32',side:256,featureSide:40,topk:40}},Object.values(copied).map(t=>t.data.buffer));
}
self.onmessage=({data})=>{tail=tail.then(()=>execute(data)).catch(error=>self.postMessage({id:data.id,ok:false,error}));};
