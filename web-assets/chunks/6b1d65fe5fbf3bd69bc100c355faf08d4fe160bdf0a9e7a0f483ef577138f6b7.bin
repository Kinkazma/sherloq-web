import "../../runtime-context.js?v=0.14.5";
import {XFEAT_PAGED_MODEL} from './xfeat-paged-assets.js';
import {createSparseSurface} from './m3-sparse-surface.js';
import {rgbRowSource} from './rgb-row-source.js';
import {createResearchSurface} from './m3-research-surface.js';
import {EngineError,requireValue,checkAbort} from './errors.js';import {payloadBytes} from './pixel-operations.js';
import {XFEAT_MODEL} from './learned-feature.js';import {ALIKED_MODELS} from './aliked-assets.js';import {SPARSE_GLUE_PAGED_MODELS} from './sparse-glue-paged-assets.js';import {SPARSE_GLUE_MODELS} from './sparse-glue.js';import {fetchM3Asset} from './m3-asset.js';
import {SparseCopyEngine,SPARSE_COPY_ALGORITHMS} from './sparse-copy.js';import {renderSparseCopy} from './sparse-copy-view.js';
import {SafireEngine} from './safire.js';import {FocalEngine} from './focal.js';import {AdaiflEngine} from './adaifl.js';import {renderResearch} from './research-view.js';
export const M3_OPERATIONS=Object.freeze({'tampering.copyMove.sparse':'sparse','ai.sources.safire':'safire','ai.localization.focal':'focal','ai.localization.adaifl':'adaifl'});
let adapterId=0;
const constructors={sparse:SparseCopyEngine,safire:SafireEngine,focal:FocalEngine,adaifl:AdaiflEngine};
export function createM3Adapter({budget,profile,version,publishResult}){
 const prefix='m3-models-'+(++adapterId)+'/';let resources={models:{}},retained=0;const engines=new Map();
 const clearImages=id=>{for(const [key,record] of engines)if(id===undefined||record.imageId===id){record.engine.dispose();engines.delete(key);}};
 return {
  capabilities(){return Object.entries(M3_OPERATIONS).map(([id,method])=>({id,status:method==='sparse'||resources.models[method]?'native-arithmetic-differences-measured':'model-required',backends:['cpu','webgpu'],regions:method==='sparse'?['full-frame','independent','compare']:['full-frame'],algorithms:method==='sparse'?SPARSE_COPY_ALGORITHMS:undefined,exports:['json','npz'],modelRequired:method!=='sparse',coordinates:method==='sparse'?'original-pixel-centres':method==='safire'?'analysis-1024-pixel-centres':'native-64-grid'}));},
  load(input){requireValue(input&&input.models&&typeof input.models==='object'&&!Array.isArray(input.models),'Explicit M3 model resources required.');const n=payloadBytes(input),free=budget.reserve(n*2);let clone;try{clone=structuredClone(input);clearImages();budget.retained-=retained;retained=0;free();budget.retain(n);retained=n;resources=clone;return {models:Object.keys(resources.models),ocrConfigured:!!resources.language,weightsBundled:false,preflightExecutions:0};}finally{free();}},
  clearImages,
  requiresFullPixels(task){return task.operation==='tampering.copyMove.sparse'&&(task.params?.algorithm?.includes('Panels')||task.params?.algorithm?.startsWith('XFeat')&&!resources.models['xfeat-paged']);},
  automaticLanguage(){return resources.language;},
  dispose(){clearImages();budget.clearPrefix(prefix);budget.retained-=retained;retained=0;resources={models:{}};},
  async run(task,image,{signal,onProgress,knownHeapBytes=0}={}){
   const method=M3_OPERATIONS[task.operation];requireValue(method,'Unknown M3 operation.');requireValue(image.pixels||image.surface,'M3 analysis requires qualified RGB pixels or research source rows.');const source=image.pixels??{format:'rgb8',...rgbRowSource(image.surface),temporarySession:image.session,getTemporarySession:image.ensureTemporarySession};
   requireValue(!task.regions||Array.isArray(task.regions)&&task.regions.length===0,'Sparse polygons belong in params.regions; learned research uses the full image.');const backend=task.backend??'auto';requireValue(['auto','cpu','webgpu'].includes(backend),'Invalid M3 backend.');checkAbort(signal);
   const key=task.imageId+'\0'+method;let record=engines.get(key);if(!record){record={imageId:task.imageId,engine:new constructors[method](source,budget,profile)};engines.set(key,record);}else record.engine.image=source;
   const releases=[],reserveMemory=n=>{const free=budget.reserve(n);releases.push(free);return free;},start=performance.now();let raw,surfaceRecord,published=false;
   try{
    reserveMemory(knownHeapBytes);let models=resources.models;
    if(method==='sparse'){
     models={...models};const algorithm=task.params?.algorithm??'SIFT + G2NN + RANSAC',names=[];
     if(algorithm.startsWith('XFeat'))names.push(models['xfeat-paged']?'xfeat-paged':'xfeat');if(algorithm.startsWith('ALIKED'))names.push(algorithm.includes('rotation')?'aliked-n16rot':'aliked-n16');if(algorithm.includes('Glue')){const kind=algorithm.startsWith('XFeat')?'xfeat':algorithm.startsWith('SIFT')?'sift':'aliked';names.push(models[kind+'-glue-paged']?kind+'-glue-paged':kind+'-glue');}
     const asset=async(supplied,identity)=>{if(supplied?.data)return supplied;requireValue(supplied?.sha256===identity.sha256&&typeof supplied.url==='string','Explicit pinned model required.');const key=prefix+identity.sha256,hit=budget.get(key);let data=hit?.value;if(!data){const free=reserveMemory(identity.bytes*2);try{data=await fetchM3Asset(new URL(supplied.url,globalThis.location.href),identity,signal);}finally{free();}reserveMemory(identity.bytes);budget.put(key,{value:data,byteLength:data.byteLength});}else reserveMemory(identity.bytes);return {data,sha256:identity.sha256};};
     for(const name of names){const supplied=models[name];if(name.startsWith('aliked-n16')){const graphs={};for(const [stage,id] of Object.entries(ALIKED_MODELS[name].graphs))graphs[stage]=await asset(supplied?.graphs?.[stage],id);models[name]={graphs};}else models[name]=await asset(supplied,name==='xfeat'?XFEAT_MODEL:name==='xfeat-paged'?XFEAT_PAGED_MODEL:(name.endsWith('-paged')?SPARSE_GLUE_PAGED_MODELS:SPARSE_GLUE_MODELS)[name.split('-')[0]]);}
    }
    raw=await record.engine.analyze(task.params??{}, {storageContext:{temporarySession:image.session,getTemporarySession:image.ensureTemporarySession},model:resources.models[method],models,language:resources.language,backend,signal,onProgress:e=>onProgress?.({...e,id:task.id,phase:e.phase==='complete'?'rendering':e.phase,fraction:(e.fraction??0)*.98})});checkAbort(signal);
    const {release,...data}=raw;if(data.status==='no-regions'){onProgress?.({id:task.id,phase:'complete',fraction:1});checkAbort(signal);return {id:task.id,imageId:task.imageId,operation:task.operation,status:'no-regions',data,layers:[],provenance:{engine:version,operation:task.operation,params:task.params??{},originalSha256:image.sha256,decode:structuredClone(image.provenance),native:'core/cloning2.py',backend:'cpu'},metrics:{preflightExecutions:0,totalMs:performance.now()-start}};}
    data.metadata={...data.metadata,method,...(method==='safire'?{native_shape:[1024,1024]}:{})};
    const view=image.segmented?(surfaceRecord=await (method==='sparse'?createSparseSurface:createResearchSurface)(image,data,task.view??{},{budget,signal}),{layout:'surface',surface:surfaceRecord.surface.descriptor,style:surfaceRecord.style,legend:surfaceRecord.legend,...(method==='sparse'?{visible:surfaceRecord.visible,selectedGroups:surfaceRecord.selectedGroups}:{})}):method==='sparse'?await renderSparseCopy(image.pixels,data,task.view??{},{signal,reserveMemory}):await renderResearch(image.pixels,data,task.view??{},{signal,reserveMemory});checkAbort(signal);
    const actual=data.backend??data.metadata.provider??data.metadata.inference?.provider??'cpu',result={id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',data,...view,layers:[{id:task.operation,kind:'rgb',origin:[0,0],range:[0,255],...(surfaceRecord?{surfaceId:surfaceRecord.surface.descriptor.id,width:source.width,height:source.height}:{})}],provenance:{engine:version,operation:task.operation,params:data.params??task.params??{},backend:actual,originalSha256:image.sha256,decode:structuredClone(image.provenance),native:method==='sparse'?'core/cloning2.py':'core/'+method+'.py',kernelParity:'Native method, measured floating arithmetic differences; see M3 delivery proofs.',coordinates:method==='sparse'?'original-pixel-centres':data.metadata.native_shape},metrics:{totalMs:performance.now()-start,cache:{stages:data.metadata.stageCache,result:!!data.metadata.result_reused,proposals:!!data.metadata.proposals_reused},backend:actual,preflightExecutions:0,memory:budget.snapshot()}};
    onProgress?.({id:task.id,phase:'complete',fraction:1});checkAbort(signal);if(surfaceRecord){requireValue(typeof publishResult==='function','Research surface publisher required.');surfaceRecord.provenance=structuredClone(result.provenance);publishResult(task.imageId,surfaceRecord);published=true;}return result;
   }finally{if(surfaceRecord&&!published)await surfaceRecord.surface.dispose();if(image.segmented)record.engine.image=null;raw?.release();releases.forEach(f=>f());}
  }
 };
}
