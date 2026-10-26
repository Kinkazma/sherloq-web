import "../runtime-context.js?v=0.25.0";
import {runComprintFingerprintSource} from './comprint-inference.js';
import {allocateOwnedTypedArray} from '../unified-engine/src/allocation.js';
import {requireValue,checkAbort,createCooperator} from '../unified-engine/src/errors.js';

/** The original nearest-coordinate extrapolation is restricted to each real
 * context. Invalid cells use the minimum of the ONE global valid population.
 * Gaps and contexts without a native grid remain NaN, never synthetic scores. */
export async function rasterComprintNativeContexts(numerical,contexts,width,height,{budget,signal}={}){
 const map=numerical.outputs?.map?.data,valid=numerical.outputs?.valid?.data,grids=numerical.metadata?.native_context_grids;
 requireValue(map instanceof Float64Array&&valid instanceof Uint8Array&&map.length===valid.length&&Array.isArray(grids)&&grids.length===contexts.length,'Native Comprint map geometry changed.');
 let minimum=Infinity;for(let i=0;i<map.length;i++)if(valid[i]){requireValue(Number.isFinite(map[i]),'Native Comprint map contains a nonfinite valid score.');minimum=Math.min(minimum,map[i]);}
 requireValue(Number.isFinite(minimum),'No valid global Comprint map cells.');
 const owner=allocateOwnedTypedArray(Float64Array,width*height,{budget,owner:'comprint-native-result',label:'native-context-anomaly-map'}),cooperate=createCooperator(signal);let success=false;
 try{owner.data.fill(NaN);for(let index=0;index<grids.length;index++){
  const g=grids[index],c=contexts[index];requireValue(g.index===index&&g.width===c.width&&g.height===c.height&&Number.isSafeInteger(c.x)&&Number.isSafeInteger(c.y)&&c.x>=0&&c.y>=0&&c.x+c.width<=width&&c.y+c.height<=height,'Comprint context projection differs from its admitted native bounds.');
  if(!g.cells)continue;
  requireValue(g.cells===g.rows*g.columns&&g.start>=0&&g.start+g.cells<=map.length,'Comprint native feature slice exceeds the global population.');
  // Uniform centres49.5+8k have midpoints53.5+8k. This is the unchanged
  // authors' nearest-coordinate tie policy: an exact midpoint picks the left.
  const nearest=(value,n)=>Math.max(0,Math.min(n-1,Math.ceil((value-53.5)/8)));
  for(let y=0;y<c.height;y++){await cooperate();const row=nearest(y,g.rows)*g.columns;for(let x=0;x<c.width;x++){const at=g.start+row+nearest(x,g.columns);owner.data[(c.y+y)*width+c.x+x]=valid[at]?map[at]:minimum;}}
 }
 checkAbort(signal);success=true;return owner;
 }finally{if(!success)owner.release();}
}

/** Only supplied verified context readers reach the CNN. No envelope reader,
 * encoded Original or synthetic RGB mosaic is used by this native pipeline. */
export async function runComprintNativeContexts(source,{infer,analyzeContexts,budget,signal,onProgress,concurrency=1,coreSize=512,memoStatistics=(_,fn)=>fn(signal),digest,beforeRaster}={}){
 const contexts=source.comprintNativeContexts;
 requireValue(Array.isArray(contexts)&&contexts.length>0&&typeof analyzeContexts==='function'&&typeof infer==='function'&&typeof digest==='function','Comprint needs native context inference and global statistics.');
 requireValue(Number.isSafeInteger(source.width)&&Number.isSafeInteger(source.height)&&source.width>0&&source.height>0&&Number.isSafeInteger(source.width*source.height),'Comprint presentation geometry must be exact native dimensions.');
 let pixels=0;for(const c of contexts){requireValue(Number.isSafeInteger(c?.width)&&Number.isSafeInteger(c?.height)&&c.width>0&&c.height>0&&Number.isSafeInteger(c.x)&&Number.isSafeInteger(c.y)&&typeof c.readWindow==='function','Comprint native context reader is invalid.');pixels+=c.width*c.height;requireValue(Number.isSafeInteger(pixels),'Comprint native population size is not exact.');}
 const releaseWorkspace=budget.reserve(pixels*8+contexts.length*2048),prepared=[];let raster,success=false,primary,inputReferences=1,inputsRetired=false;
 async function dropInputs(){if(--inputReferences)return;for(const c of prepared){await c.owner?.release();c.owner=null;c.luminance=null;c.fingerprint=null;}inputsRetired=true;releaseWorkspace();}
 function retainInputs(){requireValue(!inputsRetired&&inputReferences>0,'Comprint fingerprint population is retired.');inputReferences++;let done=false;return async()=>{if(done)return;done=true;await dropInputs();};}
 const releaseInputs=(()=>{let done=false;return async()=>{if(done)return;done=true;await dropInputs();};})();
 try{
  for(let index=0;index<contexts.length;index++){
   checkAbort(signal);const c=contexts[index],fp=await runComprintFingerprintSource(c,{infer,budget,signal,onProgress:event=>onProgress?.({...event,contextIndex:index,contextCount:contexts.length}),concurrency,coreSize});
   prepared.push({x:c.x,y:c.y,width:c.width,height:c.height,luminance:fp.luminance,fingerprint:fp.data,owner:fp});
  }
  checkAbort(signal);const identities=[];
  for(const c of prepared)identities.push([c.width,c.height,await digest(c.fingerprint)]);
  checkAbort(signal);const numerical=await memoStatistics('comprint-native-context-population-v1/'+JSON.stringify(identities),async sharedSignal=>{const release=retainInputs();try{return await analyzeContexts(prepared,{signal:sharedSignal,onProgress,getTemporarySession:source.getTemporarySession,storage:'temporary'});}finally{await release();}});
  checkAbort(signal);
  // Statistics are complete; all global observations survived through its last
  // native consumer. Retire their backings before allocating the full map.
  await releaseInputs();await beforeRaster?.(numerical);checkAbort(signal);
  raster=await rasterComprintNativeContexts(numerical,prepared,source.width,source.height,{budget,signal});checkAbort(signal);
  const result={method:'comprint',status:'ok',width:source.width,height:source.height,statistics:numerical,anomaly:{data:raster.data,dims:[source.height,source.width]},nativeContexts:contexts.map((c,index)=>({index,x:c.x,y:c.y,width:c.width,height:c.height,originalBounds:c.originalBounds})),semantics:'Compression fingerprint inconsistency from native RGB contexts and one global SPAM/PCA/EM population; not a forgery probability. No excluded RGB or cross-context spatial neighbourhood is fabricated.'};
  Object.defineProperty(result,'release',{value:raster.release});success=true;return result;
 }catch(error){primary=error;throw error;}finally{
  const failures=[];try{await releaseInputs();}catch(error){failures.push(error);}if(!success)try{raster?.release();}catch(error){failures.push(error);}
  if(failures.length){if(primary&&Object.isExtensible(primary))primary.comprintRetirementErrors=failures.map(e=>({code:e.code,message:e.message}));else if(!primary)throw new AggregateError(failures,'Comprint context retirement failed');}
 }
}
