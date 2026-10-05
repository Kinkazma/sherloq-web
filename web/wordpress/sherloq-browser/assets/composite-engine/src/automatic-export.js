import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkAbort} from './errors.js';
import {automaticSnapshotArray as array,streamAutomaticNpz} from './automatic-npz-stream.js';
import {createCloneCorroboration} from './clone-corroboration.js';
import {CLONE_SOURCES} from './clone-relations.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createTemporarySession} from './temporary-storage.js';

function entrySnapshot(entry) {
 const result={...entry};
 if(entry.pixel_mask){const {data,width,height}=entry.pixel_mask;result.pixel_mask=array(data,{shape:[height,width],descr:'|u1'});}
 if(entry.cells){
  const cells=entry.cells;requireValue(Array.isArray(cells)&&cells.every(p=>Array.isArray(p)&&p.length===2&&p.every(x=>Number.isInteger(x)&&x>=-2147483648&&x<=2147483647)),'Native ELA cell coordinates require int32 pairs.');
  result.cells=array({byteLength:cells.length*8,readInto(bytes,offset){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let i=0;i<bytes.length/4;i++){const at=offset/4+i;view.setInt32(i*4,cells[Math.floor(at/2)][at%2],true);}}},{shape:[cells.length,2],descr:'<i4'});
 }
 return result;
}

/** Native automatic_clones.export: scientific detector fields must already be
 * explicit array wrappers; display entries use the M5 entry contract. */
export async function exportAutomaticAnalysis(snapshot,provenance,request={},hooks={}) {
 const {budget,signal,onProgress,wasmBinary}=hooks,[height,width,channels]=snapshot?.image_shape??[],config=snapshot?.corroboration;
 requireValue([width,height].every(x=>Number.isSafeInteger(x)&&x>0)&&channels===3&&Number.isSafeInteger(width*height*5),'Original image_shape [height,width,3] required.');
 requireValue(Array.isArray(snapshot.biomes)&&config&&Array.isArray(config.entries)&&config.entries.every(e=>CLONE_SOURCES.includes(e.source))&&Array.isArray(config.excluded),'Native automatic biomes and clone-only corroboration configuration required.');
 requireValue(request.storage===undefined||['auto','memory','temporary'].includes(request.storage),'Invalid automatic export storage.');
 let engine,session,counts,contexts,headroom,working,result,entryLease;
 async function getSession(){if(!session){session=await createTemporarySession({budget,signal});hooks.onTemporarySession?.({id:session.id,backend:session.backend,purpose:'automatic-export-scratch'});}return session;}
 async function cleanup(){engine?.dispose();engine=null;headroom?.();headroom=null;working?.();working=null;entryLease?.();entryLease=null;const settled=await Promise.allSettled([counts?.dispose(),contexts?.dispose()]);counts=null;contexts=null;try{await session?.dispose();}finally{session=null;}const failure=settled.find(x=>x.status==='rejected');if(failure)throw failure.reason;}
 try{
  checkAbort(signal);
  // Keep the kernel's known working space available while choosing scratch
  // placement; this is an admission, never a calibration run.
  headroom=budget.reserve(64*1024**2);working=budget.reserve(width*Math.min(256,height));
  const storage={budget,storage:request.storage??'auto',getTemporarySession:getSession,signal};
  counts=await createSegmentedBytes(width*height,storage);contexts=await createSegmentedBytes(width*height*4,storage);
  headroom();headroom=null;engine=createCloneCorroboration({budget,wasmBinary});
  for(const byContext of [false,true])await engine.stripes({width,height,entries:config.entries,excluded:config.excluded,byContext},async strip=>{
   const bytes=byContext?new Uint8Array(strip.values.buffer,strip.values.byteOffset,strip.values.byteLength):Uint8Array.from(strip.values);
   await (byContext?contexts:counts).write(bytes,strip.top*width*(byContext?4:1));
  },{signal,onProgress:fraction=>onProgress?.({phase:byContext?'automatic-export-contexts':'automatic-export-methods',fraction})});
  await counts.flush();await contexts.flush();
  entryLease=budget.reserve(4096+(snapshot.biomes.length+config.entries.length)*2048+config.entries.reduce((n,e)=>n+String(e.id).length*8+String(e.source).length*8,0));
  const deduplicated=await engine.uniqueEnvelopes(config.entries,{signal});engine.dispose();engine=null;working();working=null;
  const metadata={...snapshot,biomes:snapshot.biomes.map(entrySnapshot),corroboration:{...config,entries:config.entries.map(entrySnapshot),counts:array(counts,{shape:[height,width],descr:'|u1'}),context_counts:array(contexts,{shape:[height,width],descr:'<u4'}),deduplicated_envelopes:deduplicated.map(entrySnapshot)}};
  result=await streamAutomaticNpz(metadata,provenance,request,hooks);await cleanup();return result;
 }catch(error){await result?.dispose();throw error;}finally{await cleanup();}
}
