import {allocateTypedArray} from './allocation.js';
import {parameters} from './pixel-utils.js';
import {requireValue,checkAbort} from './errors.js';
import {energyReferenceQuality} from './energy-pipeline.js';
import {createElaCellDescriber} from './ela-cell-describe.js';
import {createElaPeerScorer} from './ela-peer-scores.js';
import {coherentCellScores,segmentElaCells,aggregateGhostCells,ELA_PROFILE_NAMES} from './ela-cell-tools.js';
import {ghostMaps} from './ghost-maps.js';

export function elaCellParams(input={}){
 const p=parameters(input,{quality:0,block:32,threshold:2,minimum:3,ghost:true,allGrids:false,background:true},{quality:[0,100],block:[16,96],minimum:[1,1000]}, {},['ghost','allGrids','background']);
 requireValue(p.block%8===0&&Number.isFinite(p.threshold)&&p.threshold>0&&p.threshold<=50,'Invalid ELA cell size or threshold');
 requireValue(p.ghost||!p.allGrids,'Ghost phases require Ghost evidence');return p;
}
const median3=(a,b,c)=>[a,b,c].sort((x,y)=>x-y)[1];
const fields=({release,...value})=>value;

export async function elaCellPipeline(image,p,hooks={},context={}){
 const {width,height}=image,pixels=width*height,account=context.reserveMemory;
 requireValue(typeof account==='function'&&(typeof context.codec?.recompress==='function'||typeof context.cellPlanes==='function'),'Shared memory admission and JPEG codec required');
 let block=p.block;while(Math.floor(height/block)*Math.floor(width/block)>16384)block+=8;
 const rows=Math.floor(height/block),cols=Math.floor(width/block),n=rows*cols;
 requireValue(n>=25,'Image too small for 25 complete native ELA cells');
 const reference=context.referenceQuality??energyReferenceQuality(context.bytes,p.quality),q=reference.quality,levels=q<=5?[q,q+5,q+10]:q>=96?[q-10,q-5,q]:[q-5,q,q+5];
 const stage=context.stageCheckpoint,memo=context.memo??(async(_key,compute)=>compute()),budget=context.budget??{reserve:account},key=block+'/'+q,metrics={workers:1,kernel:'ela-native-cells',cellRecompressions:0,ghostPhasesComputed:0};
 // Keep live stage arrays admitted even if memo entries are evicted mid-task.
 if(stage)stage.ensure(n);else account(n*4096);
 async function workspace(compute){const releases=[];try{return await compute(bytes=>{const release=account(bytes);releases.push(release);});}finally{for(const release of releases)release();}}
 const scorer=createElaPeerScorer({budget});
 try{
  const base=await memo('cells/'+key,async()=>{
   const describer=createElaCellDescriber({budget});let planes;
   try{
    const compute=async (names,publish)=>{
     if(context.cellPlanes){const prepared=await context.cellPlanes(names.map(name=>Number(name.split('/').at(-1))),block,{...hooks,publish:publish?(quality,value)=>publish('cell-plane/'+block+'/'+quality,value):undefined});metrics.workers=Math.max(metrics.workers,prepared.workers);metrics.cellRecompressions+=prepared.recompressions;return prepared.values;}
     if(context.qualityPool&&pixels>=100000&&names.length>1){const pooled=await context.qualityPool.run(image,{signal:hooks.signal,onProgress:f=>hooks.onProgress?.(.3*f)},{mode:'cells',block,qualities:names.map(name=>Number(name.split('/').at(-1)))});metrics.workers=pooled.workers;metrics.cellScheduling=pooled.scheduling;metrics.cellRecompressions+=names.length;return pooled.values.map(row=>row[1]);}
     const results=[];
     for(const name of names){
      checkAbort(hooks.signal);const level=Number(name.split('/').at(-1));
      results.push(await workspace(async reserve=>{
       reserve(pixels*24+32*1024**2);const compressed=await context.codec.recompress(image,level,{signal:hooks.signal});metrics.cellRecompressions++;
       const described=await describer.describe(image,compressed,block,{signal:hooks.signal,onProgress:f=>hooks.onProgress?.(.3*(results.length+f)/names.length)});
       try{return fields(described);}finally{described.release();}
      }));
     }
     return results;
    };
    const names=levels.map(level=>'cell-plane/'+block+'/'+level);
    planes=context.memoMany?await context.memoMany(names,compute):await compute(names);
   }finally{describer.dispose();}
   const {content,usable}=planes[2],profiles=allocateTypedArray(Float32Array,n*15,{label:'ela-cell-stage'}),background_profiles=allocateTypedArray(Float32Array,n*9,{label:'ela-cell-stage'});
   for(let i=0;i<n;i++)for(let j=0;j<3;j++){
    profiles.set(planes[j].profiles.subarray(i*5,i*5+5),i*15+j*5);
    background_profiles.set(planes[j].background.subarray(i*3,i*3+3),i*9+j*3);
   }
   const scored=await scorer.score({rows,cols,content,supported:usable,profiles},{signal:hooks.signal});
   try{
    const supported=Uint8Array.from(scored.peer_count,v=>v>=16),legacy_score=Float32Array.from({length:n},(_,i)=>median3(...scored.quality_scores.subarray(i*3,i*3+3))),coherent_score=await workspace(reserve=>coherentCellScores({rows,cols,signed_scores:scored.signed_scores,supported},{signal:hooks.signal,account:reserve}));
    const score=Float32Array.from(legacy_score,(v,i)=>Math.max(v,coherent_score[i]));
    return {rows,cols,content,profiles,background_profiles,...fields(scored),supported,legacy_score,coherent_score,score};
   }finally{scored.release();}
  });
  await context.onCellsReady?.({quality:q,qualities:levels});
  let result=base;
  if(p.ghost){
   const ghost=await memo('cell-ghost/'+key+'/'+Number(p.allGrids),async()=>{
    const state=stage?await stage.memo('ghost-progress/'+key+'/'+Number(p.allGrids),async()=>({nextPhase:0,best:makeBest()})):{nextPhase:0,best:makeBest()};
    function makeBest(){return {ghost_score:allocateTypedArray(Float32Array,n,{label:'ela-cell-stage'}),ghost_quality:allocateTypedArray(Int16Array,n,{label:'ela-cell-stage'}),ghost_phase:allocateTypedArray(Uint8Array,n*2,{label:'ela-cell-stage'}),ghost_peer_count:allocateTypedArray(Int32Array,n,{label:'ela-cell-stage'}),ghost_curves:allocateTypedArray(Float32Array,n*71,{label:'ela-cell-stage'}),ghost_supported:allocateTypedArray(Uint8Array,n,{label:'ela-ghost-supported'})};}
    const {best}=state,side=p.allGrids?8:1;
    for(let dy=0;dy<side;dy++)for(let dx=0;dx<side;dx++)await workspace(async reserve=>{
     const phase=dy*side+dx;if(phase<state.nextPhase)return;
     checkAbort(hooks.signal);if(!context.ghostCells)reserve(context.ghostWorkspaceBytes??(pixels*24+32*1024**2+Math.floor(width/16)*Math.floor(height/16)*71*24));
     let bounded;const maps=await (context.ghostCells?(...args)=>context.ghostCells(...args,{rows,cols,block,dx,dy}):context.ghostMaps??ghostMaps)(image,{low:30,high:100,step:1,x:dx,y:dy},{signal:hooks.signal,onProgress:f=>hooks.onProgress?.(.3+.6*(phase+f)/(side*side))},context);
     bounded=!!context.ghostCells;
     try{
     metrics.workers=Math.max(metrics.workers,maps.engineMetrics.workers);metrics.ghostPhasesComputed++;if(maps.engineMetrics.scheduling)metrics.ghostScheduling=maps.engineMetrics.scheduling;
     const aggregate=bounded?maps.data:await aggregateGhostCells({...maps.data,qualities:71},{rows,cols,block,dx,dy},{signal:hooks.signal,account:reserve}),supported=Uint8Array.from(base.supported,(v,i)=>v&&aggregate.valid[i]);
     const scored=await scorer.score({rows,cols,content:base.content,supported,profiles:aggregate.curves,kind:'ghost',qualities:71},{signal:hooks.signal});
     try{for(let i=0;i<n;i++){
      const update=scored.ghost_score[i]>best.ghost_score[i];
      if(update){best.ghost_score[i]=scored.ghost_score[i];best.ghost_quality[i]=scored.ghost_quality[i];best.ghost_phase[i*2]=dx;best.ghost_phase[i*2+1]=dy;}
      if(update||(dx===0&&dy===0)){best.ghost_peer_count[i]=scored.ghost_peer_count[i];best.ghost_curves.set(aggregate.curves.subarray(i*71,i*71+71),i*71);}
      best.ghost_supported[i]|=scored.ghost_supported[i];
     }state.nextPhase=phase+1;}finally{scored.release();}
     }finally{if(bounded&&(!stage||state.nextPhase>phase))await maps.release();}
    });
    return best;
   });
   result={...base,...ghost,ela_score:base.score,score:Float32Array.from(base.score,(v,i)=>Math.max(v,ghost.ghost_score[i]))};
  }
  if(p.background){
   const bg=await memo('cell-background/'+key,async()=>{const value=await scorer.score({rows,cols,content:base.content,supported:base.supported,profiles:base.background_profiles,kind:'background'},{signal:hooks.signal});try{return fields(value);}finally{value.release();}});
   result={...result,...bg,pre_background_score:result.score,score:Float32Array.from(result.score,(v,i)=>Math.max(v,bg.background_score[i]))};
  }
  const metadata={method:'ela_biomes',version:p.background?4:p.ghost?3:2,...reference,qualities:levels,block,requested_block:p.block,image_shape:[height,width],valid_shape:[rows*block,cols*block],descriptors:ELA_PROFILE_NAMES,experimental:true,score_kind:'uncalibrated_robust_profile_distance',probability:false,score_combination:p.background?'maximum_existing_and_background':p.ghost?'maximum_existing_and_ghost':'maximum_legacy_and_coherent',ghost:{enabled:p.ghost,grids:p.ghost?(p.allGrids?64:1):0,qualities:p.ghost?Array.from({length:71},(_,i)=>i+30):[],quality_is:'maximum_deficit_probe_not_original_quality'},background:{enabled:p.background,trim_quantiles:[.1,.9],direction:'deficit_only',minimum_peers:16,maximum_peers:64},energy:{enabled:false,separate_operation:'ela.energy'}};
  const segmented=await workspace(reserve=>segmentElaCells({...result,metadata},{threshold:p.threshold,minimum:p.minimum},{signal:hooks.signal,account:reserve}));
  checkAbort(hooks.signal);hooks.onProgress?.(1);
  return {data:{width,height,...result,labels:segmented.labels,regions:segmented.regions,metadata:{...segmented.metadata,regions:segmented.regions}},engineMetrics:metrics,layers:[{id:'ela-cell-scores',kind:'scalar',field:'data.score',origin:[0,0],width:cols,height:rows,pixelSize:[block,block]},{id:'ela-cell-regions',kind:'labels',field:'data.labels',origin:[0,0],width:cols,height:rows,pixelSize:[block,block]}],semantics:'Native content-matched ELA cell residual profiles, seeded regions, optional Ghost curve deficits and background deficits. Scores are exploratory distances, not probabilities. Only complete source-resolution cells contribute; pixel-energy regions are available separately through ela.energy.'};
 }finally{scorer.dispose();}
}
