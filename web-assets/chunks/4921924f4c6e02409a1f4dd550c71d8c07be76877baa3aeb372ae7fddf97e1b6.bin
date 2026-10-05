import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue} from './errors.js';
import {automaticD2prlRequest} from './automatic-ai-regions.js';
import {d2prlEntries} from './automatic-ai-entries.js';

/** Actual loaded D2PRL adapter, one provider per automatic source/session.
 * The adapter/model and image remain caller-owned. */
export function createAutomaticD2prlProvider({adapter,image,imageId,wasmBinary}) {
 requireValue(typeof adapter?.runOwned==='function'&&typeof adapter?.readRawOwned==='function'&&image&&typeof imageId==='string'&&imageId.length>0,'Loaded owned D2PRL adapter and original image identity required.');
 let revision=0,current;
 const wrap=output=>({value:{result:output.data,provenance:output.provenance,metrics:output.metrics},release:output.release});
 return {
  async run(job,hooks){
   requireValue(job.id==='d2prl'&&job.enabled,'Enabled D2PRL group required.');current=null;
   const task=automaticD2prlRequest(hooks.plan,{id:'automatic-d2prl-'+(++revision),imageId});
   const output=await adapter.runOwned(task,image,hooks);current={analysisId:output.data.metadata.analysisId,resultId:output.data.metadata.resultId};return wrap(output);
  },
  async prepare(value,filters,hooks){
   const owned=await d2prlEntries(value.result,{budget:hooks.budget,minimum:filters.d2Minimum,signal:hooks.signal,onProgress:hooks.onProgress,wasmBinary,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,
    async refilter(minimum,options){
     const task={id:'automatic-d2prl-filter-'+(++revision),imageId,operation:'ai.clones.d2prl',backend:hooks.plan.cpu?'cpu':'auto',params:{minimum,refilterOf:value.result.metadata.analysisId}};
     const output=await adapter.runOwned(task,image,{...options,resourceOperation:hooks.resourceOperation});current={analysisId:output.data.metadata.analysisId,resultId:output.data.metadata.resultId};return {...output.data,release:output.release};
    }
   });return {value:{entries:owned.entries},release:owned.release};
  },
  releaseCheckpoint(key){return adapter.releaseCheckpoint?.(key);},
  readRaw(value){
   if(!current||current.analysisId!==value.result.metadata.analysisId)throw new EngineError('CACHE_MISS','D2PRL provider no longer owns the current analysis identity.');
   return wrap(adapter.readRawOwned({imageId,resultId:current.resultId}));
  }
 };
}
