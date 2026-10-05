import {createWasmTensorArena} from '../src/wasm-tensor-arena.js';
import {Budget} from '../src/cache.js';
import {createD2prlRecovery} from '../experiments/d2prl/recovery.js';
import {createPatchMatch} from '../experiments/d2prl/patchmatch.js';
import {createEvaluatorPool} from '../experiments/d2prl/evaluator-pool.js';
import {createConvolutionCpu} from '../experiments/d2prl/convolution-cpu.js';
const ensure=(condition,message)=>{if(!condition)throw Error(message);};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
async function run(fault){
 const budget=new Budget(256*1024**2),events=[],trace=[],operation=createD2prlRecovery({budget,onRecovery:event=>events.push(event),reclaim:async()=>1});const arena=createWasmTensorArena({budget}),featureLeases=[];let pool,engine,result;
 try{
  engine=await createPatchMatch(null,{budget,operation,evaluatorFactory:async(_,options)=>pool=await createEvaluatorPool(new URL('../vendor/d2prl/evaluator-tiled.js',import.meta.url).href,{budget,maxWorkers:2,tileSize:32,operation,...(fault?{workerFactory:()=>new Worker(new URL('./d2prl-recovery-evaluator-worker.js',import.meta.url),{type:'module'})}:{})})});
  const side=16,n=side*side,features=channels=>{const value=arena.allocate(Uint16Array,channels*n);featureLeases.push(value);for(let i=0;i<value.data.length;i++)value.data[i]=0x3000+(i*13+i%17)%512;return value.data;},randomState={state:Array.from({length:624},(_,i)=>Math.imul(i+1,1664525)>>>0),left:1,next:0};
  result=await engine.run({zmFeatures:features(36),cnnFeatures:features(96),side,iterations:4,randomState},{onTrace:event=>trace.push([event.iteration,event.branch,event.phase,event.call])});
  const hashes=await Promise.all(['offsets','coordinates'].flatMap(key=>['zm','cnn'].flatMap(branch=>['x','y'].map(axis=>hash(result[key][branch][axis]))))),random=result.finalRandomState,stats=pool.stats,candidateWorkspace=result.candidateWorkspace;
  result.release();result=null;engine.dispose();engine=null;for(const value of featureLeases)value.release();arena.dispose();ensure(budget.total()===0&&!budget.recovering,'Unreleased ownership');return {hashes,random,trace,stats,candidateWorkspace,events:events.map(e=>({operation:e.operation,error:e.error.code,cause:e.error.cause?.name,completedOperations:e.completedOperations})),budgetFinal:budget.total()};
 }finally{result?.release();engine?.dispose();for(const value of featureLeases)value.release();arena.dispose();}
}
async function convolution(fault){
 const budget=new Budget(768*1024**2),events=[],progress=[],operation=createD2prlRecovery({budget,onRecovery:e=>events.push(e),reclaim:async()=>1}),engine=createConvolutionCpu({budget,moduleUrl:new URL('../vendor/d2prl/convolution.js',import.meta.url).href,maxWorkers:2,operation,...(fault?{workerFactory:()=>new Worker(new URL('./d2prl-recovery-convolution-worker.js',import.meta.url),{type:'module'})}:{})});let result;
 try{result=await engine.run({input:Float32Array.from({length:3*128*128},(_,i)=>(i%19)/32),weights:Float32Array.from({length:16*3*9},(_,i)=>(i%7)/64),bias:new Float32Array(16),channels:3,height:128,width:128,outChannels:16,kernel:3,padding:1},{onProgress:e=>progress.push(e.completed)});const output={sha256:await hash(result.data),tiles:progress.length,workers:result.workers,recoveries:events.length};result.release();result=null;engine.dispose();ensure(budget.total()===0&&!budget.recovering,'Convolution ownership');return output;}finally{result?.release();engine.dispose();}
}
self.onmessage=async()=>{try{
 const reference=await run(false),recovered=await run(true);
 for(const key of ['hashes','random','trace'])ensure(JSON.stringify(reference[key])===JSON.stringify(recovered[key]),'Native mismatch: '+key);
 ensure(recovered.events.length===2,'Expected one output-copy refusal per evaluator worker');ensure(reference.stats.tiles===recovered.stats.tiles,'Previously committed tiles were replayed');ensure(reference.stats.descriptorUploads===recovered.stats.descriptorUploads,'Descriptors were reloaded');
 ensure(reference.candidateWorkspace.allocations===4&&recovered.candidateWorkspace.allocations===4,'Candidate banks were recreated');ensure(reference.candidateWorkspace.residentBytes===26*16*16*4,'Candidate workspace exceeded one pair');
 const convolutionReference=await convolution(false),convolutionRecovered=await convolution(true);ensure(convolutionReference.sha256===convolutionRecovered.sha256&&convolutionReference.tiles===convolutionRecovered.tiles,'Convolution changed useful output/work');ensure(convolutionRecovered.recoveries===2,'Convolution refusal coverage');
 self.postMessage({result:{reference:{hashes:reference.hashes,evaluations:reference.trace.length,stats:reference.stats,candidateWorkspace:reference.candidateWorkspace},recovered:{hashes:recovered.hashes,evaluations:recovered.trace.length,stats:recovered.stats,candidateWorkspace:recovered.candidateWorkspace,recoveries:recovered.events},convolution:{reference:convolutionReference,recovered:convolutionRecovered},exactRng:true,budgetFinal:recovered.budgetFinal}});
}catch(error){self.postMessage({error:{message:error.message,stack:error.stack,code:error.code,details:error.details}});}};
