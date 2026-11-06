import {createGhostCellArray} from './ela-biomes-ghost-owner.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {requireValue,checkAbort,isResumableResourceError,normalizeResourceError,controlCheckpoint,createCooperator} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {segmentedGhostShape,produceSegmentedGhostPlanes} from './segmented-ghosts.js';
import {aggregateGhostQuality} from './ela-cell-tools.js';
import {getExecutionScheduler} from './execution-scheduler.js';

// A single quality plane is the working set. Authoritative raw planes can spill
// independently; committing a plane never requires a second H×W×Q allocation.
export async function segmentedGhostCells(image,p,grid,{budget,signal,onProgress,maxWorkers=1,adaptive,getPlane,putPlane,checkpoint,onCheckpoint,pendingRegistry,storage='auto',backend='cpu'}={}){
 if(!pendingRegistry){image.ghostCellRetirements??={entries:new Set(),async dispose(){await retireCompositeOwners([...this.entries].map(state=>()=>state.dispose()));}};pendingRegistry=image.ghostCellRetirements.entries;}
 const cooperate=createCooperator(signal),shape=segmentedGhostShape(image,p),{rows:mapRows,cols:mapCols,qualities}=shape,{rows,cols,block,dx=p.x,dy=p.y}=grid,m=mapRows*mapCols,n=rows*cols;
 requireValue(Number.isInteger(n)&&n>0&&n<=16384&&block>=16&&block%8===0,'Bounded Ghost cell grid required');
 const identity=JSON.stringify([image.surface.descriptor,p,grid]);requireValue(!checkpoint||checkpoint.identity===identity&&checkpoint.source===image.surface&&!checkpoint.disposed,'Ghost checkpoint identity changed');
 const state=checkpoint??{identity,source:image.surface,committed:new Uint8Array(qualities.length),quality:0,owners:{},raw:null,metrics:{workers:1,qualityPlanesComputed:0,recompressions:0},disposed:false};
 state.buffers??=new Set();state.temporaries??=new Set();
 state.dispose??=async()=>{if(state.disposed)return;if(state.retirement)return state.retirement;state.retiring=true;const task=(async()=>{await state.raw?.dispose();state.raw=null;await retireCompositeOwners([...state.temporaries,...state.buffers].map(owner=>()=>owner.release()));state.owners={};state.source=null;state.disposed=true;pendingRegistry?.delete(state);})();state.retirement=task;try{await task;}finally{state.retirement=null;}};
 state.release??=state.dispose;pendingRegistry?.add(state);
 requireValue(!state.retiring,'Ghost cell checkpoint is retiring.');
 // A resumable phase may still own a refused publication scratch ACK. Settle
 // that debt before admitting another working set for the same phase.
 await retireCompositeOwners([...state.temporaries].map(owner=>()=>owner.release()));
 const operation=budget.beginOperation?.({owner:'ela',id:'ghost-cell-phase'}),scheduler=getExecutionScheduler(budget,{maxWorkers});let plane,integral,complete=false,keep=false,failed=false,primary;
 const report=()=>onCheckpoint?.(state),own=async(name,Type,length)=>state.owners[name]??=await createGhostCellArray(Type,length,budget,state.buffers,{label:'ghost-cell-'+name,operation});
 try{
  report();checkAbort(signal);operation?.setState('io');
  const curves=(await own('curves',Float64Array,n*qualities.length)).data,valid=(await own('valid',Uint8Array,n)).data;
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)valid[y*cols+x]=((y+1)*block+dy)/16<=mapRows&&((x+1)*block+dx)/16<=mapCols?1:0;
  if(state.quality<qualities.length){
   // These are used for publication/aggregation, not allocation probes.
   plane=await createGhostCellArray(Float64Array,m,budget,state.temporaries,{label:'ghost-cell-read-plane',operation});
   integral=await createGhostCellArray(Float64Array,(mapRows+1)*(mapCols+1),budget,state.temporaries,{label:'ghost-cell-integral',operation});
   if(!state.owners.low)(await own('low',Float64Array,m)).data.fill(Infinity);
   if(!state.owners.high)(await own('high',Float64Array,m)).data.fill(-Infinity);
   const low=state.owners.low.data,high=state.owners.high.data;
   state.raw??=await createSegmentedBytes(m*qualities.length*8,{budget,storage,signal,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,owner:'ela',label:'ghost-committed-planes'});
   state.raw.markCold();report();operation?.setState('waiting-child');
   const metrics=await produceSegmentedGhostPlanes(image,p,{budget,signal,onProgress,maxWorkers,backend,adaptive,getPlane,putPlane,skipQualities:qualities.filter((_,q)=>state.committed[q]),onPlane:async(quality,values)=>{
    const q=qualities.indexOf(quality);state.raw.markCold(false);try{
     await state.raw.write(new Uint8Array(values.buffer,values.byteOffset,values.byteLength),q*m*8);await state.raw.flush();
     // min/max are idempotent, so an interrupted publication may be replayed.
     for(let i=0;i<m;i++){low[i]=Math.min(low[i],values[i]);high[i]=Math.max(high[i],values[i]);}
     state.committed[q]=1;state.metrics.qualityPlanesComputed++;operation?.commit();report();
    }finally{state.raw.markCold();}
   }});state.metrics={...metrics,qualityPlanesComputed:state.metrics.qualityPlanesComputed};
   for(let q=state.quality;q<qualities.length;q++){
    await cooperate();operation?.setState('io');await state.raw.readInto(new Uint8Array(plane.data.buffer),q*m*8);
    await scheduler.run({cpu:1,signal,resourceOwner:'ela',operation,label:'ghost-cell-aggregate'},async()=>{
     for(let i=0;i<m;i++)plane.data[i]=high[i]===low[i]?0:(plane.data[i]-low[i])/(high[i]-low[i]);
     await aggregateGhostQuality(i=>plane.data[i],{mapRows,mapCols,rows,cols,block,dx,dy,qualities:qualities.length,q,curves,integral:integral.data},{signal,cooperate});
    });state.quality=q+1;operation?.commit();report();onProgress?.({phase:'ghost-cell-quality',quality:qualities[q],completed:q+1,total:qualities.length});
   }
  }
  // Once curves are authoritative, discard their much larger raw predecessor.
  await state.raw?.dispose();state.raw=null;for(const name of ['low','high']){await state.owners[name]?.release();delete state.owners[name];}
  complete=true;return {data:{rows,cols,qualities:qualities.length,curves,valid},engineMetrics:{...state.metrics,boundedWorkingSet:true,committedQualities:state.committed.reduce((a,b)=>a+b,0),aggregatedQualities:state.quality},state,release:state.dispose};
 }catch(error){const failure=normalizeResourceError(error);failed=true;primary=failure;keep=!!onCheckpoint&&isResumableResourceError(failure)&&!signal?.aborted;throw failure;}
 finally{await retireCompositeOwners([...state.temporaries].map(owner=>()=>owner.release()).concat([()=>operation?.release(),...(!complete&&!keep?[()=>state.dispose()]:[])]),failed?{primary}:{});}
}
