import {combineSparseWindowPresentation} from './sparse-window-presentation.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

// Data adaptation only. Full native fields/stores stay borrowed privately from
// the carrier. Only typed/plain evidence may cross the public worker boundary.
export async function combineDenseWindowPresentation(answer,options={}){
 const {budget,signal}=options;checkAbort(signal);
 const native=answer.windowResults.filter(w=>w.status==='complete').map(w=>({id:w.id,kind:w.kind,bounds:[...w.bounds],origin:[...w.origin],fingerprint:w.fingerprint,sourceContextIdentity:w.sourceContextIdentity,raw:w.output}));
 let fieldMetadataBytes=0;for(const w of native)for(const f of w.raw.dense_maps)fieldMetadataBytes+=1024+sourceRegionTransportBytes([f.width,f.height,f.shift,f.pass,f.context],{allowAliases:true,allowUndefined:true})*8;requireValue(Number.isSafeInteger(fieldMetadataBytes),'Dense field metadata size is not safe.');
 const metadata=budget.reserve(fieldMetadataBytes+65536+sourceRegionTransportBytes(native.map(({raw,...w})=>({...w,params:raw.params,geometry:raw.geometry,mirror_policy:raw.mirror_policy,extension_bins:raw.extension_bins})),{allowAliases:true,allowUndefined:true})*4);
 let presentation,extra,ready=false;
 try{
  const safe={...answer,windowResults:answer.windowResults.map(w=>{if(w.status!=='complete')return w;const {dense_maps,release,...small}=w.output;requireValue(Array.isArray(dense_maps),'Complete native Dense fields are required.');return{...w,output:{...small,release}};})};
  presentation=await combineSparseWindowPresentation(safe,options);const data=presentation.data,m=data.pairs.length/4;
  // Dense's original renderer expects all normal pairs before its mirror
  // cutoff. Reorder PRESENTATION rows only; native arrays remain untouched.
  const pairBytes=m*(4+4*8+3+4+1),groupRows=data.groups.reduce((n,g)=>n+g.length,0);
  requireValue(Number.isSafeInteger(pairBytes+groupRows*4),'Dense presentation allocation is not safe.');extra=budget.reserve(pairBytes+groupRows*4+4096);
  const remap=new Uint32Array(m),pairs=new Float64Array(m*4),colors=new Uint8Array(m*3),regions=new Int32Array(m),algorithms=new Uint8Array(m),normal=[],mirror=[];
  // Only interval metadata is held here, not unfinanced per-pair JS lists.
  let offset=0,cutoff=0,maximumOverlap;
  for(const w of native){const r=w.raw,n=r.pairs.length/4,policy=r.mirror_policy,base=policy?.base_pair_count??n;requireValue(Number.isSafeInteger(base)&&base>=0&&base<=n&&r.pair_algorithms instanceof Uint8Array&&r.pair_algorithms.length===n,'Native Dense mirror/algorithm evidence changed.');normal.push([offset,offset+base,r,offset]);mirror.push([offset+base,offset+n,r,offset]);cutoff+=base;offset+=n;if(policy){requireValue(Number.isFinite(policy.maximum_overlap)&&(maximumOverlap===undefined||maximumOverlap===policy.maximum_overlap),'Different native Dense mirror policies cannot share one unchanged renderer.');maximumOverlap=policy.maximum_overlap;}}
  requireValue(offset===m,'Dense native/presentation pair counts differ.');let at=0;
  for(const spans of [normal,mirror])for(const[a,b,r,nativeOffset]of spans)for(let old=a;old<b;old++,at++){if((at&8191)===0)await controlCheckpoint(signal);remap[old]=at;pairs.set(data.pairs.subarray(old*4,old*4+4),at*4);colors.set(data.colors.subarray(old*3,old*3+3),at*3);regions[at]=data.pair_search_regions[old];algorithms[at]=r.pair_algorithms[old-nativeOffset];}
  data.pairs=pairs;data.colors=colors;data.pair_search_regions=regions;data.pair_algorithms=algorithms;data.groups=data.groups.map(g=>Uint32Array.from(g,row=>remap[row]));
  data.group_algorithms=native.flatMap(w=>w.raw.group_algorithms);data.group_variants=native.flatMap(w=>w.raw.group_variants);data.group_frames=native.flatMap(w=>w.raw.group_frames);
  requireValue([data.group_algorithms,data.group_variants,data.group_frames].every(a=>a.length===data.groups.length),'Complete Dense native group metadata is required.');
  data.mirror_policy=maximumOverlap===undefined?null:{normal_preserved:true,base_pair_count:cutoff,maximum_overlap:maximumOverlap,overlap_filter_stage:'display',native_policies:'dense_windows[].raw.mirror_policy retained separately'};
  for(const key of ['dense_count','dense_consistent_count']){data[key]=native.reduce((n,w)=>n+w.raw[key],0);requireValue(Number.isSafeInteger(data[key])&&data[key]>=0,'Dense count exceeds exact public integer domain.');}
  data.dense_maps=[];data.dense_windows=native;data.geometry=native[0]?.raw.geometry??null;data.extension_bins=null;
  data.metadata.cloneAnalysisWindows.nativeData='windowResults[].dataNatif retains native typed/plain evidence; full Dense maps stay private and are exported under NPZ native_windows with original arrays/stores.';data.metadata.method='dense';data.metadata.denseWindowRecipe='dense-scoped-window/1';data.metadata.denseNativeWindows=native.map(({raw,...w})=>({...w,params:structuredClone(raw.params),geometry:structuredClone(raw.geometry),mirror_policy:structuredClone(raw.mirror_policy),extension_bins:structuredClone(raw.extension_bins),fields:raw.dense_maps.map(f=>({width:f.width,height:f.height,shift:f.shift,pass:f.pass,context:f.context}))}));
  data.metadata.cloneAnalysisWindows.presentationPairOrder='all native normal ranges, then all native mirror ranges; native arrays unchanged';
  for(const range of data.metadata.cloneAnalysisWindows.ranges){range.nativePairCount=range.pairRows[1]-range.pairRows[0];range.pairRows=null;range.pairRowsPolicy='reconstruct from ordered native windows and their native mirror cutoffs';}
  checkAbort(signal);ready=true;let closed=false;
  return{data,reservedBytes:presentation.reservedBytes+pairBytes+groupRows*4+4096,release(){if(closed)return;presentation.release();extra();metadata();closed=true;}};
 }finally{if(!ready){presentation?.release();extra?.();metadata();}}
}
