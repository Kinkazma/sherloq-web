import "../../runtime-context.js?v=0.25.0";
import {noisesnifferOwnerRetirement as ownerRetirement} from './noisesniffer-owner-retirement.js';
import {EngineError,requireValue} from './errors.js';
import {automaticD2prlRequest} from './automatic-ai-regions.js';
import {d2prlEntries} from './automatic-ai-entries.js';

/** Actual loaded D2PRL adapter, one provider per automatic source/session.
 * The adapter/model and image remain caller-owned. */
export function createAutomaticD2prlProvider({adapter,image,imageId,wasmBinary}) {
 requireValue(typeof adapter?.runOwned==='function'&&typeof adapter?.readRawOwned==='function'&&image&&typeof imageId==='string'&&imageId.length>0,'Loaded owned D2PRL adapter and original image identity required.');
 let revision=0,current;const temporaryRetirements=new Set();
 const retireTemporary=output=>{let retire;retire=ownerRetirement([()=>output.release()],{onRetired(){temporaryRetirements.delete(retire);}});temporaryRetirements.add(retire);return retire;};
 const drainTemporary=async()=>{for(const retire of [...temporaryRetirements])await retire();};
 const wrap=output=>({value:{result:output.data,provenance:output.provenance,metrics:output.metrics},release:output.release});
 return {
  async run(job,hooks){
   await drainTemporary();requireValue(job.id==='d2prl'&&job.enabled,'Enabled D2PRL group required.');current=null;
   const task=automaticD2prlRequest(hooks.plan,{id:'automatic-d2prl-'+(++revision),imageId});
   const output=await adapter.runOwned(task,image,hooks);current={analysisId:output.data.metadata.analysisId,resultId:output.data.metadata.resultId,...(output.data.metadata.scientificScope?.stage==='fully-cancelled-before-inference'?{empty:structuredClone(output.data.metadata)}:{})};return wrap(output);
  },
  async prepare(value,filters,hooks){
   await drainTemporary();if(value.result.metadata.scientificScope?.stage==='fully-cancelled-before-inference')return {value:{entries:[]},release(){}};
   const owned=await d2prlEntries(value.result,{budget:hooks.budget,minimum:filters.d2Minimum,signal:hooks.signal,onProgress:hooks.onProgress,wasmBinary,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,
    async refilter(minimum,options){
     const task={id:'automatic-d2prl-filter-'+(++revision),imageId,operation:'ai.clones.d2prl',backend:hooks.plan.cpu?'cpu':'auto',params:{minimum,refilterOf:value.result.metadata.analysisId}};
     const output=await adapter.runOwned(task,image,{...options,resourceOperation:hooks.resourceOperation});current={analysisId:output.data.metadata.analysisId,resultId:output.data.metadata.resultId};return {...output.data,release:output.release};
    }
   });return {value:{entries:owned.entries},release:owned.release};
  },
  async prepareTemporary(value,filters,hooks){
   await drainTemporary();const basis=current,metadata=value.result?.metadata,analysisId=metadata?.analysisId,minimum=filters.d2Minimum;
   requireValue(basis&&basis.analysisId===analysisId&&Number.isInteger(minimum)&&minimum>=0&&minimum<=5000,'Retained automatic D2PRL basis and minimum required.');
   if(metadata.scientificScope?.stage==='fully-cancelled-before-inference')return {value:{entries:[],analysisId,calculatedMinimum:minimum,inferences:0},release(){}};
   const owned=await d2prlEntries(value.result,{budget:hooks.budget,minimum,signal:hooks.signal,onProgress:hooks.onProgress,wasmBinary,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,
    async refilter(calculated,options){
     const task={id:'automatic-d2prl-preview-'+(++revision),imageId,operation:'ai.clones.d2prl',retainedD2Preview:true,backend:hooks.plan.cpu?'cpu':'auto',params:{minimum:calculated,refilterOf:analysisId}};
     const output=await adapter.runOwned(task,image,{...options,resourceOperation:hooks.resourceOperation}),release=retireTemporary(output);let complete=false;
     try{const m=output.data?.metadata,mode=value.provenance?.cloneWindowMode??metadata.cloneWindowMode;requireValue(current===basis&&m?.analysisId===analysisId&&m.min_component===calculated&&m.inferences===0&&output.metrics?.inferences===0&&output.data.width===value.result.width&&output.data.height===value.result.height&&(!mode||(output.cloneWindowMode??m.cloneWindowMode)===mode),'Temporary D2PRL result differs from its retained native basis or performed inference.');complete=true;return {...output.data,release};}finally{if(!complete)await release();}
    }
   });return {value:{entries:owned.entries,analysisId,calculatedMinimum:minimum,inferences:0},release:owned.release};
  },
  async releaseCheckpoint(key){await drainTemporary();return adapter.releaseCheckpoint?.(key);},
  readRaw(value){
   if(!current||current.analysisId!==value.result.metadata.analysisId)throw new EngineError('CACHE_MISS','D2PRL provider no longer owns the current analysis identity.');
   if(current.empty)return {value:{result:{width:value.result.width,height:value.result.height,rawGrids:[],metadata:{...current.empty,raw_shape:[3,448,448]}},provenance:{inferences:0,scientificScope:current.empty.scientificScope}},release(){}};
   const answer=adapter.readRawOwned({imageId,resultId:current.resultId});return answer&&typeof answer.then==='function'?Promise.resolve(answer).then(wrap):wrap(answer);
  }
 };
}
