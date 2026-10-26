// Control-flow fixture only. It executes neither a learned graph nor Pyodide.
// The actual core/extension engine, readers, queues, banks and owners are used.
import * as comprint from '../../../extensions-source/comprint-statistics.js';
export const comprintControlledState={modelCalls:[],statisticsCalls:0,operations:[],fitIndices:[],workers:[],cacheEvictions:[],gate:null};
const tensor=(data,dims=[data.length])=>({data,dims}),MiB=1024**2;
function outputsFor(job){const a=job.inputs;
 switch(job.operation){
 case 'feature_chunk':{const n=a.crop.data[2]*a.crop.data[3],features=Float32Array.from({length:n*512},(_,i)=>Math.fround(a.fingerprint.data[(Math.floor(Math.floor(i/512)/a.crop.data[3])+a.crop.data[0])*8*a.fingerprint.dims[1]+Math.floor(i/512)%a.crop.data[3]*8+a.crop.data[1]*8+49*a.fingerprint.dims[1]+49]+(i%512)/512));return{features:tensor(features,[n,512]),valid:tensor(new Uint8Array(n).fill(1))};}
 case 'covariance_chunk':return{covariance:tensor(new Float64Array(512*512),[512,512])};
 case 'stream_basis':return{basis:tensor(new Float64Array(512*32),[512,32]),eigs:tensor(new Float64Array(512))};
 case 'project_chunk':{const n=a.features.dims[0];return{projected:tensor(Float64Array.from({length:n*32},(_,i)=>a.features.data[Math.floor(i/32)*512+i%32]),[n,32])};}
 case 'retain_training_chunked':return{mu:tensor(new Float64Array(10*32),[10,1,32]),Sigma:tensor(new Float64Array(10*32*32),[10,32,32]),prior:tensor(new Float64Array(10),[10,1,1]),initial_indices:tensor(Int32Array.from({length:10},(_,i)=>i))};
 case 'retain_training_only':case 'release_state':return{};
 case 'fit_retained_chunked':comprintControlledState.fitIndices.push(...a.indices.data);return{indices:a.indices,mu:a.mu,Sigma:a.Sigma,prior:a.prior,outlier:tensor(new Float64Array(a.indices.data.length).fill(.01)),score:tensor(Float64Array.from(a.indices.data)),iterations:tensor(new Int32Array(a.indices.data.length).fill(100))};
 case 'finish_chunk':return{map:tensor(Float64Array.from({length:a.projected.dims[0]},(_,i)=>Math.abs(a.projected.data[i*32])*100+1))};
 default:throw Error('Unexpected controlled operation '+job.operation);
 }
}
export class ControlledStatisticsWorker extends EventTarget{
 constructor(){super();this.dead=false;comprintControlledState.workers.push(this);}
 postMessage(message){if(this.dead)throw Error('Controlled worker retired');if(message.command==='execute'){
  const job=this.job;queueMicrotask(async()=>{try{await comprintControlledState.gate?.({kind:'statistics',job});if(this.dead)return;const outputs=outputsFor(job);comprintControlledState.operations.push(job.operation);this.onmessage?.({data:{id:job.id,outputs,metadata:{runtime:{heapBytes:4*MiB},timings_seconds:{},controlledNumerics:true}}});}catch(error){this.onmessage?.({data:{id:job.id,error:{message:error.message,code:error.code??'CONTROLLED_ERROR'}}});}});
 }else{this.job=message;queueMicrotask(()=>{if(!this.dead)this.onmessage?.({data:{id:message.id,executionReady:true,heapBytes:4*MiB}});});}}
 terminate(){this.dead=true;}
}
export async function createExtensionEngine(options){
 const remove=options.budget.remove.bind(options.budget);options.budget.remove=(key,...rest)=>{if(options.budget.cache.has(key))comprintControlledState.cacheEvictions.push({key,modelCalls:comprintControlledState.modelCalls.length});return remove(key,...rest);};
 const actual=await import(new URL('engine.js',options.baseURL));
 return actual.createExtensionEngine({...options,loadModule:async method=>{if(method!=='comprint')throw Error('Only Comprint belongs to this controlled fixture');return{...comprint,createComprintStatistics(settings){const stats=comprint.createComprintStatistics({...settings,workerFactory:()=>new ControlledStatisticsWorker()});return{...stats,analyzeContexts(contexts,settings){comprintControlledState.statisticsCalls++;return stats.analyzeContexts(contexts,{...settings,storage:'memory'});}};}};},createPool:budget=>({slots:[],snapshot:()=>({controlledNoModel:true}),clear(){},dispose(){},async run(model,feeds,{signal,onProgress}){
  if(signal?.aborted)throw signal.reason;const input=feeds.luminance_normalized,hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',input.data))].map(v=>v.toString(16).padStart(2,'0')).join('');comprintControlledState.modelCalls.push({model,hash,dims:[...input.dims]});onProgress?.({phase:'controlled-comprint-inference'});await comprintControlledState.gate?.({kind:'inference',signal});if(signal?.aborted)throw signal.reason;
  const release=budget.reserve(input.data.byteLength),data=Float32Array.from(input.data,(v,i)=>Math.fround(v+Math.sin(i*.17)*.1));return{result:{'Identity:0':{data,dims:[...input.dims]}},release,metrics:{provider:'controlled-no-model',threads:0}};
 }})});
}
