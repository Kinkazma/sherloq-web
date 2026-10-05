import {createWasmTensorArena} from '../src/wasm-tensor-arena.js';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {createD2prlRecovery} from '../experiments/d2prl/recovery.js';
import {createPatchMatch} from '../experiments/d2prl/patchmatch.js';
import {createEvaluatorPool} from '../experiments/d2prl/evaluator-pool.js';
import {createConvolutionCpu} from '../experiments/d2prl/convolution-cpu.js';
const ensure=(condition,message)=>{if(!condition)throw Error(message);};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
// Development-only injection at the real worker boundary. Every native kernel
// and every input is unchanged; the third useful response of one worker is
// unreadable, or its third command reaches the endpoint as null.
function workers(url,kind){const all=[],candidates=new Map();let faults=0;return{get candidates(){return candidates;},get count(){return all.length;},get faults(){return faults;},factory(){const index=all.length,native=new Worker(url,{type:'module'});let submitted=0,completed=0;const facade={closed:false,postMessage(data,transfer=[]){if(data.type==='evaluate'){const bits=a=>Array.from(new Uint32Array(a.buffer,a.byteOffset,a.length));const signature=JSON.stringify([data.key,data.side,data.channels,data.candidates,data.begin,data.end,bits(data.x),bits(data.y)]);candidates.set(signature,(candidates.get(signature)??0)+1);}const useful=data.type==='evaluate'||data.kind==='compute';if(useful)submitted++;if(index===0&&kind==='endpoint'&&useful&&submitted===3){faults++;native.postMessage(null);return;}native.postMessage(data,transfer);},terminate(){this.closed=true;native.terminate();}};native.onmessage=event=>{const useful=event.data?.x instanceof Float32Array||event.data?.values instanceof Float32Array;if(useful)completed++;if(index===0&&kind&&kind!=='endpoint'&&useful&&completed===3){faults++;if(kind==='null')facade.onmessage?.({data:null});else facade.onmessageerror?.(new MessageEvent('messageerror'));}else facade.onmessage?.(event);};native.onmessageerror=event=>facade.onmessageerror?.(event);native.onerror=event=>facade.onerror?.(event);all.push(facade);return facade;}};}
function clean(budget){ensure(budget.total()===0&&!budget.recovering,'Unreleased budget');ensure(getExecutionScheduler(budget).snapshot().running===0,'Unreleased CPU');}
async function patchmatch(kind){
 const budget=new Budget(256*1024**2),events=[],trace=[],operation=createD2prlRecovery({budget,onRecovery:e=>events.push(e),reclaim:()=>{throw Error('Transport invoked global reclaim');}}),arena=createWasmTensorArena({budget}),featureLeases=[],factory=workers(new URL('../experiments/d2prl/evaluator-worker.js',import.meta.url),kind);let pool,engine,result;
 try{
  engine=await createPatchMatch(null,{budget,operation,evaluatorFactory:async()=>pool=await createEvaluatorPool(new URL('../vendor/d2prl/evaluator-tiled.js',import.meta.url).href,{budget,maxWorkers:2,tileSize:32,operation,workerFactory:()=>factory.factory()})});
  const side=16,n=side*side,features=channels=>{const lease=arena.allocate(Uint16Array,channels*n);featureLeases.push(lease);for(let i=0;i<lease.data.length;i++)lease.data[i]=0x3000+(i*13+i%17)%512;return lease.data;},randomState={state:Array.from({length:624},(_,i)=>Math.imul(i+1,1664525)>>>0),left:1,next:0};
  result=await engine.run({zmFeatures:features(36),cnnFeatures:features(96),side,iterations:4,randomState},{onTrace:e=>trace.push([e.iteration,e.branch,e.phase,e.call])});
  const output={candidates:factory.candidates,hashes:await Promise.all(['offsets','coordinates'].flatMap(key=>['zm','cnn'].flatMap(branch=>['x','y'].map(axis=>hash(result[key][branch][axis]))))),random:result.finalRandomState,trace,stats:pool.stats,candidateWorkspace:result.candidateWorkspace,recoveries:events.map(e=>({operation:e.operation,error:e.error.code,completedOperations:e.completedOperations})),faults:factory.faults,createdWorkers:factory.count};
  result.release();result=null;engine.dispose();engine=null;for(const lease of featureLeases)lease.release();arena.dispose();clean(budget);return output;
 }finally{result?.release();engine?.dispose();for(const lease of featureLeases)lease.release();arena.dispose();}
}
async function convolution(kind){
 const budget=new Budget(768*1024**2),events=[],progress=[],operation=createD2prlRecovery({budget,onRecovery:e=>events.push(e),reclaim:()=>{throw Error('Transport invoked global reclaim');}}),factory=workers(new URL('../experiments/d2prl/convolution-cpu-worker.js',import.meta.url),kind),engine=createConvolutionCpu({budget,moduleUrl:new URL('../vendor/d2prl/convolution.js',import.meta.url).href,maxWorkers:2,operation,workerFactory:()=>factory.factory()});let result;
 try{result=await engine.run({input:Float32Array.from({length:3*128*128},(_,i)=>(i%19)/32),weights:Float32Array.from({length:16*3*9},(_,i)=>(i%7)/64),bias:new Float32Array(16),channels:3,height:128,width:128,outChannels:16,kernel:3,padding:1},{onProgress:e=>progress.push(e.completed)});const output={sha256:await hash(result.data),tiles:progress.length,workers:result.workers,recoveries:events.map(e=>e.error.code),faults:factory.faults,createdWorkers:factory.count};result.release();result=null;engine.dispose();clean(budget);return output;}finally{result?.release();engine.dispose();}
}
self.onmessage=async()=>{try{
 const reference=await patchmatch(null),convReference=await convolution(null),cases=[];
 for(const kind of ['null','messageerror','endpoint']){
  const recovered=await patchmatch(kind),convRecovered=await convolution(kind);
  for(const key of ['hashes','random','trace'])ensure(JSON.stringify(reference[key])===JSON.stringify(recovered[key]),'Native PatchMatch mismatch '+kind+': '+key);
  ensure(reference.candidates.size===recovered.candidates.size&&[...reference.candidates].every(([signature,count])=>(recovered.candidates.get(signature)??0)>=count),'Candidate bits changed');ensure([...recovered.candidates.values()].reduce((a,b)=>a+b,0)===[...reference.candidates.values()].reduce((a,b)=>a+b,0)+1,'Unexpected replayed candidates');
  ensure(recovered.faults===1&&recovered.recoveries.length===1&&recovered.recoveries[0].error==='WORKER_MESSAGE_FAILED','Evaluator transport incident '+kind);
  ensure(recovered.createdWorkers===3&&recovered.stats.activeWorkers===2&&recovered.stats.tiles===reference.stats.tiles,'Evaluator lost completed tiles or capacity');
  ensure(recovered.stats.descriptorUploads===reference.stats.descriptorUploads+1,'Healthy descriptors were reloaded');
  ensure(JSON.stringify(recovered.candidateWorkspace)===JSON.stringify(reference.candidateWorkspace),'Candidate workspace was recreated');
  ensure(convRecovered.sha256===convReference.sha256&&convRecovered.tiles===convReference.tiles,'Native convolution mismatch '+kind);
  ensure(convRecovered.createdWorkers===3&&convRecovered.workers===2&&convRecovered.faults===1&&convRecovered.recoveries.length===1&&convRecovered.recoveries[0]==='WORKER_MESSAGE_FAILED','Convolution transport incident '+kind);
  cases.push({kind,patchmatch:{hashes:recovered.hashes,stats:recovered.stats,recoveries:recovered.recoveries,createdWorkers:recovered.createdWorkers},convolution:convRecovered,exactRng:true,exactCandidates:true});
 }
 self.postMessage({result:{reference:{hashes:reference.hashes,evaluations:reference.trace.length,stats:reference.stats,candidateWorkspace:reference.candidateWorkspace,convolution:convReference},cases,budgetFinal:0,schedulerFinal:0}});
}catch(error){self.postMessage({error:{message:error.message,stack:error.stack,code:error.code,details:error.details}});}};
