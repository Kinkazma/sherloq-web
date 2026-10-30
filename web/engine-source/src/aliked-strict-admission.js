import {alikedNativeParameters} from './aliked-native-parameters.js';
import {Budget} from './cache.js';
import {requireValue} from './errors.js';
const MiB=1024**2,up64=n=>Math.ceil(n/65536)*65536;
/** Conservative full-plan prepayment on the existing shared parent budget.
 * The child accounts allocations WITHIN that charged extent, not extra RAM.
 * No profile/RAM hint is introduced, and refusal occurs before any source read. */
export function admitAlikedStrict(coverage,{budget,modelBytes,inputSide=1024,detectionThreshold=.2,provider='wasm',storage='memory',runtimeHeapBytes=2048*MiB,runtimeReservation,temporaryAvailable=false}={}){
 const parameters=alikedNativeParameters({inputSide,detectionThreshold});requireValue((coverage?.inputSide??1024)===inputSide,'ALIKED context inputSide differs from its native admission.');requireValue(['wasm','webgpu'].includes(provider)&&coverage?.contexts&&budget?.reserve&&Number.isSafeInteger(modelBytes)&&modelBytes>0&&['memory','temporary','auto'].includes(storage)&&Number.isSafeInteger(runtimeHeapBytes)&&runtimeHeapBytes>=16*MiB&&runtimeHeapBytes<=2048*MiB&&runtimeHeapBytes%65536===0,'Invalid ALIKED native full-plan admission.');
 if(runtimeReservation)requireValue(runtimeReservation.budget===budget&&runtimeReservation.bytes===runtimeHeapBytes&&runtimeReservation.live===true,'External native runtime must remain charged to the same shared budget.');
 let samples=0,largest=0,padded=0;for(const c of coverage.contexts){requireValue(c.nativeInputEvaluable,'ALIKED native input has zero short-axis size, preserving native rejection.');const n=c.preparedWidth*c.preparedHeight;samples+=n;largest=Math.max(largest,n);padded=Math.max(padded,Math.ceil(c.preparedWidth/32)*32*Math.ceil(c.preparedHeight/32)*32);}
 // Worst-case native raw peaks<=samples. Selector carrier uses five cells per
 // peak; native vector growth and copied input arrays are separately included.
 const requestedStorage=storage;
 const parts={gpuResident:provider==='webgpu'?64*MiB+1536*largest:0,runtimeHeap:runtimeReservation?0:runtimeHeapBytes,modelTransfer:2*modelBytes,preparedAndRawContexts:12*largest+8*samples,featureStore:storage==='temporary'?16*MiB:512*samples,denseExternalOutput:516*largest,commonPopulation:66*samples+80000,nativeSelector:up64(32*MiB+85*samples+80000),headWorkspace:256*MiB,globalBank:20_000*(56+512+16)+32*MiB,preparationAndMetadata:64*MiB+256*coverage.contexts.length};
 // Choose the existing lossless store before reservation or any source read.
 // Optional caches are not evicted just to keep every feature tensor in RAM.
 let maximumBytes=up64(Object.values(parts).reduce((a,b)=>a+b,0));
 if(storage==='auto'){storage='memory';if(temporaryAvailable&&maximumBytes>budget.limit-budget.total()){storage='temporary';parts.featureStore=16*MiB;maximumBytes=up64(Object.values(parts).reduce((a,b)=>a+b,0));}}
 requireValue(Number.isSafeInteger(maximumBytes),'ALIKED plan exceeds exact accounting.');const release=budget.reserve(maximumBytes),child=new Budget(maximumBytes);let closed=false;
 return{budget:child,plan:Object.freeze({...parameters,provider,samples,largest,padded,storage,requestedStorage,runtimeHeapBytes,externalRuntimeHeap:!!runtimeReservation,maximumBytes,parts:Object.freeze(parts),policy:'one prepaid extent charged to existing shared budget; child allocations stay within it; selected native inputSide and unchanged FP32/grant'}),release(){if(closed)return;requireValue(child.total()===0,'ALIKED admission remains charged until every child allocation ACK.');closed=true;release();}};
}
