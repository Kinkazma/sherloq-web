import "../../runtime-context.js?v=0.25.0";
import {requireValue,checkAbort} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {allocateOwnedTypedArray} from './allocation.js';

/** The native Proposal CRF output is ALREADY on its Original window chart.
 * Publish those Float32 bytes directly, with no interpolation/resizing/model.
 * The raw retained native chart is never modified. Display-only context views
 * intersect exact candidate/source membership before all published fields. */
export function createSelfDMProposalProductProjection({budget,onOwner}={}){
 const stores=new Map(),arrays=new Set(),creating=new Set(),controller=new AbortController();let active,requested=false,closed=false,closing,started=false;
 const release=()=>{requested=true;controller.abort();if(closed)return Promise.resolve();if(closing)return closing;closing=(async()=>{await Promise.allSettled([active,...creating]);for(const[key,store]of stores){await store.dispose();stores.delete(key)}for(const a of [...arrays]){await a.release();arrays.delete(a)}closed=true})().finally(()=>{closing=null});return closing};
 const owner={release,dispose:release};onOwner?.(owner);
 async function work({width,height,origin,raw,contextDomain,candidateDomain,nativeContexts,zoneIds,metadata,temporarySession,getTemporarySession},hooks){
  const signal=AbortSignal.any([controller.signal,...(hooks.signal?[hooks.signal]:[])]);
  requireValue(raw instanceof Float32Array&&raw.length===width*height&&[width,height].every(n=>Number.isSafeInteger(n)&&n>0)&&Array.isArray(origin)&&origin.length===2&&contextDomain?.containsOriginal&&candidateDomain?.containsOriginal&&Array.isArray(nativeContexts)&&nativeContexts.length>0,'Native Original-chart Proposal probability and exact context/candidate domains required');checkAbort(signal);
  const selected=zoneIds===undefined?null:new Set(zoneIds);requireValue(!selected||[...selected].every(id=>nativeContexts.some(c=>c.id===id)),'Unknown retained native Proposal display context ID');
  const contexts=nativeContexts.filter(c=>!selected||selected.has(c.id));
  for(const key of['map','mask','analyzed','candidates']){const pending=createSegmentedBytes(width*height*(key==='map'?4:1),{budget,temporarySession,getTemporarySession,signal,owner:'selfdm-proposal-product',label:key}).then(store=>{stores.set(key,store);return store});creating.add(pending);try{await pending}finally{creating.delete(pending)}}
  const rows=Math.max(1,Math.floor(262144/width)),count=width*Math.min(rows,height),make=(Type,n,label)=>{const a=allocateOwnedTypedArray(Type,n,{budget,owner:'selfdm-proposal-product',label});arrays.add(a);return a.data};
  const map=make(Float32Array,count,'proposal-public-probability'),mask=make(Uint8Array,count,'proposal-public-mask'),analyzed=make(Uint8Array,count,'proposal-public-context'),candidates=make(Uint8Array,count,'proposal-public-candidate');let positive=0;
  for(let y=0;y<height;y+=rows){checkAbort(signal);const n=Math.min(rows,height-y),size=n*width;map.fill(0);mask.fill(0);analyzed.fill(0);candidates.fill(0);
   for(let dy=0;dy<n;dy++)for(let x=0;x<width;x++){
    const ox=origin[0]+x,oy=origin[1]+y+dy,at=dy*width+x,inside=contexts.some(c=>ox>=c.bounds[0]&&oy>=c.bounds[1]&&ox<c.bounds[2]&&oy<c.bounds[3]);
    const context=inside&&contextDomain.containsOriginal(ox,oy),candidate=context&&candidateDomain.containsOriginal(ox,oy);if(context)analyzed[at]=1;if(!candidate)continue;
    const p=raw[(y+dy)*width+x];requireValue(Number.isFinite(p)&&p>=0&&p<=1.00001,'Native Proposal published probability contract');map[at]=p;candidates[at]=1;if(p>.5){mask[at]=1;positive++}
   }
   const offset=y*width;await stores.get('map').write(new Uint8Array(map.buffer,0,size*4),offset*4);for(const[key,data]of[['mask',mask],['analyzed',analyzed],['candidates',candidates]])await stores.get(key).write(data.subarray(0,size),offset);
  }
  for(const store of stores.values())await store.flush();for(const a of [...arrays]){await a.release();arrays.delete(a)}checkAbort(signal);
  return{width,height,stores:Object.fromEntries(stores),metadata:{...metadata,zones:contexts.map(c=>({id:c.id,kind:'native-context',bounds:c.bounds.map((v,i)=>v-origin[i%2]),originalBounds:[...c.bounds],analysis_shape:[1,height,width]})),boxes:contexts.map(c=>c.bounds.map((v,i)=>v-origin[i%2])),threshold:.5,threshold_rule:'probability>0.5',probability_interpolation:'none; native Original-chart CRF probability',mask_interpolation:'none; direct native threshold',status:positive?'ok':'empty',positivePixels:positive,channel_order:['union_probability'],raw_filter_applied:false,coordinates:'source-region-native',originalOrigin:[...origin]},release,dispose:release};
 }
 return{release,run(input,hooks={}){requireValue(!started&&!requested&&!closed,'Native Proposal projection is single-use');started=true;active=Promise.resolve().then(()=>work(input,hooks));return active}};
}
