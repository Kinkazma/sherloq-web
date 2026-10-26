import {EngineError,requireValue} from './errors.js';
import {copyTypedArray,wasmAllocationFailure} from './allocation.js';
const MiB=1024**2,MAX_COUNT=Math.floor(2147483647/256),PAGE=16*MiB;
function plan(bytes,extra){requireValue(Number.isSafeInteger(bytes)&&bytes>0,'Invalid SAFIRE native workspace.');const postHeapBytes=Math.ceil(Math.max(32*MiB,bytes)/PAGE)*PAGE;if(postHeapBytes>2048*MiB)throw new EngineError('MEMORY_LIMIT','SAFIRE native postprocessing exceeds the WASM address space.',{details:{requestedBytes:postHeapBytes}});return{postHeapBytes,workingBytes:postHeapBytes+extra};}
export function planSafireClustering(count,params){
 requireValue(Number.isInteger(count)&&count>0&&count<=MAX_COUNT&&['kmeans','dbscan'].includes(params.kind)&&Number.isInteger(params.groups)&&params.groups>=1&&params.groups<=16&&typeof params.binary==='boolean'&&Number.isFinite(params.eps)&&params.eps>0&&Number.isInteger(params.minimum)&&params.minimum>=1&&params.minimum<=2147483647,'Invalid SAFIRE global proposal count.');
 // DBSCAN keeps the reference DFS order, including duplicate pending neighbours.
 // Vector capacity/reallocation can coexist with up to n*(n-1)/2 pending ints.
 const stack=params.kind==='dbscan'?6*count*(count-1):0,native=count*(params.kind==='kmeans'?2112:1056)+stack+32*MiB;
 return plan(native,count*2112+65536);
}
export function planSafireProjection(channels,width=1024,height=1024){requireValue(Number.isInteger(channels)&&channels>0&&channels<=2047&&[width,height].every(n=>Number.isInteger(n)&&n>0&&n<=1024),'Invalid SAFIRE fragment projection.');const n=width*height,input=channels*65536*4,output=n*(channels*4+9);return plan(input+output+32*MiB,input+output*2+65536);}
function allocator(m){const allocated=[];return{alloc(bytes){const p=m._malloc(Math.max(8,bytes));if(!p)throw wasmAllocationFailure(m,'SAFIRE global postprocessing allocation failed.',bytes);allocated.push(p);return p;},put(a){const p=this.alloc(a.byteLength);m.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;},dispose(){for(const p of allocated)m._free(p);}};}
export function clusterSafireNative(m,{features,confidence,params}){
 const count=confidence?.length;planSafireClustering(count,params);requireValue(features instanceof Float32Array&&features.length===count*256&&features.every(Number.isFinite)&&confidence instanceof Float32Array&&confidence.every(Number.isFinite),'Invalid SAFIRE global descriptors.');const a=allocator(m);
 try{const fp=a.put(features),lp=a.alloc(count*4),iterations=params.kind==='kmeans'?m._safire_kmeans(fp,count,params.binary?2:params.groups,lp):m._safire_dbscan(fp,count,params.eps,params.minimum,lp);requireValue(Number.isInteger(iterations)&&iterations>=0&&(params.kind!=='kmeans'||iterations>0),'SAFIRE native global clustering failed.');const assignments=copyTypedArray(m.HEAP32.subarray(lp/4,lp/4+count),{label:'safire-global-clusters'}),best=new Map();
  for(let i=0;i<count;i++){const label=assignments[i];requireValue(label>=-1&&label<count,'Invalid native SAFIRE cluster label.');if(label>=0&&(!best.has(label)||confidence[i]>confidence[best.get(label)]))best.set(label,i);}
  const chosen=Int32Array.from([...best.values()].sort((x,y)=>x-y)),labels=Int32Array.from(chosen,i=>assignments[i]);return{assignments,chosen,clusterLabels:labels,metadata:{clusteringIterations:params.kind==='kmeans'?iterations:null,postHeapBytes:m.HEAPU8.byteLength}};
 }finally{a.dispose();}
}
export function projectSafireFragmentNative(m,{masks,globalIds,binary=false,front=-1,back=-1,width=1024,height=1024}){
 const channels=globalIds?.length;planSafireProjection(channels,width,height);requireValue(masks instanceof Float32Array&&masks.length===channels*65536&&masks.every(Number.isFinite)&&globalIds instanceof Uint32Array&&new Set(globalIds).size===channels&&typeof binary==='boolean'&&[front,back].every(i=>Number.isInteger(i)&&i>=-1&&i<channels),'Invalid SAFIRE local prototype projection.');const a=allocator(m),n=width*height;
 try{const mp=a.put(masks),ip=a.put(globalIds),pp=a.alloc(channels*n*4),op=a.alloc(n*4),lp=a.alloc(n*4),kp=a.alloc(n);requireValue(m._safire_fragment_maps(mp,ip,channels,+binary,front,back,width,height,pp,op,lp,kp)===1,'SAFIRE native fragment projection failed.');return{map:copyTypedArray(m.HEAPF32.subarray(op/4,op/4+n),{label:'safire-fragment-map'}),source_probabilities:copyTypedArray(m.HEAPF32.subarray(pp/4,pp/4+channels*n),{label:'safire-fragment-probabilities'}),source_labels:copyTypedArray(m.HEAPU32.subarray(lp/4,lp/4+n),{label:'safire-fragment-labels'}),analysis_scope:copyTypedArray(m.HEAPU8.subarray(kp,kp+n),{label:'safire-fragment-analysis-scope'}),metadata:{postHeapBytes:m.HEAPU8.byteLength}};
 }finally{a.dispose();}
}
