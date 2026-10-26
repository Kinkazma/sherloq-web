import {Budget} from './cache.js';
import {requireValue} from './errors.js';
const MiB=1024**2,up64=n=>Math.ceil(n/65536)*65536;
/** Conservative full-plan prepayment on the existing shared parent budget.
 * The child accounts allocations WITHIN that charged extent, not extra RAM.
 * No profile/RAM hint is introduced, and refusal occurs before any source read. */
export function admitAlikedStrict(coverage,{budget,modelBytes,provider='wasm',storage='memory',runtimeHeapBytes=2048*MiB,runtimeReservation}={}){
 requireValue(['wasm','webgpu'].includes(provider)&&coverage?.contexts&&budget?.reserve&&Number.isSafeInteger(modelBytes)&&modelBytes>0&&['memory','temporary'].includes(storage)&&Number.isSafeInteger(runtimeHeapBytes)&&runtimeHeapBytes>=16*MiB&&runtimeHeapBytes<=2048*MiB&&runtimeHeapBytes%65536===0,'Invalid ALIKED native full-plan admission.');
 if(runtimeReservation)requireValue(runtimeReservation.budget===budget&&runtimeReservation.bytes===runtimeHeapBytes&&runtimeReservation.live===true,'External native runtime must remain charged to the same shared budget.');
 let samples=0,largest=0,padded=0;for(const c of coverage.contexts){requireValue(c.nativeInputEvaluable,'ALIKED native input has zero short-axis size, preserving native rejection.');const n=c.preparedWidth*c.preparedHeight;samples+=n;largest=Math.max(largest,n);padded=Math.max(padded,Math.ceil(c.preparedWidth/32)*32*Math.ceil(c.preparedHeight/32)*32);}
 // Worst-case native raw peaks<=samples. Selector carrier uses five cells per
 // peak; native vector growth and copied input arrays are separately included.
 const parts={gpuResident:provider==='webgpu'?64*MiB+1536*largest:0,runtimeHeap:runtimeReservation?0:runtimeHeapBytes,modelTransfer:2*modelBytes,preparedAndRawContexts:12*largest+8*samples,featureStore:storage==='memory'?512*samples:16*MiB,denseExternalOutput:516*largest,commonPopulation:66*samples+80000,nativeSelector:up64(32*MiB+85*samples+80000),headWorkspace:256*MiB,globalBank:20_000*(56+512+16)+32*MiB,preparationAndMetadata:64*MiB+256*coverage.contexts.length};
 const maximumBytes=up64(Object.values(parts).reduce((a,b)=>a+b,0));requireValue(Number.isSafeInteger(maximumBytes),'ALIKED plan exceeds exact accounting.');const release=budget.reserve(maximumBytes),child=new Budget(maximumBytes);let closed=false;
 return{budget:child,plan:Object.freeze({provider,samples,largest,padded,storage,runtimeHeapBytes,externalRuntimeHeap:!!runtimeReservation,maximumBytes,parts:Object.freeze(parts),policy:'one prepaid extent charged to existing shared budget; child allocations stay within it; unchanged native1024and FP32/grant'}),release(){if(closed)return;requireValue(child.total()===0,'ALIKED admission remains charged until every child allocation ACK.');closed=true;release();}};
}
