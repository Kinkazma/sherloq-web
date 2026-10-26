import {automaticNativeCloneWindows} from './automatic-unprepared-clones.js';
import {createAutomaticPreparedForgeryscope} from './automatic-prepared-forgeryscope.js';
import {prepareAutomaticStrictContext} from './automatic-strict-context.js';
import {scopedAutomaticForgeryscope} from './automatic-forgeryscope-stream.js';
import {compileOriginalSourceRegions,createOriginalSourceRegionsState} from './source-region-geometry.js';
import {localizeSourceRegionTask} from './source-region-localize.js';
import {sparseStrictImageRecord} from './sparse-strict-source.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {requireValue,checkAbort} from './errors.js';
const shift=(polys,o)=>(polys??[]).map(p=>p.map(([x,y])=>[x+o[0],y+o[1]]));
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(v=>v.toString(16).padStart(2,'0')).join('');
/** Native geometric acquisitions only. No text completion or OCR result is
 * synthesized. The ordinary verified-context owner and native ensemble remain
 * the sole source/compiler and analysis owners behind this facade. */
export function createAutomaticUnpreparedForgeryscope(analyzer,{image,selection,task={},budget}={}){
 requireValue(typeof analyzer?.analyze==='function'&&budget?.reserve,'Native Forgeryscope analyzer and shared budget required.');
 const record=sparseStrictImageRecord(image,budget),original=record.originalSource??record,origin=record.sourceRegionOrigin??[0,0],lifetime=new AbortController(),metadata=budget.reserve(65536+8*sourceRegionTransportBytes([selection,task],{allowAliases:true,allowUndefined:true}));let windows;try{windows=automaticNativeCloneWindows(selection,origin);}catch(error){metadata();throw error;}
 let context,provider,scope,inputKey,active=false,closed=false,finished=Promise.resolve(),closing,freed=false;
 return{
  async analyzeSelection(source,plan,options={}){
   requireValue(!closed&&!active&&source.sha256===record.sha256,'Native automatic Forgeryscope is busy, disposed or belongs to another Original.');active=true;let finish,output,returned=false,failed=false,primary;finished=new Promise(r=>finish=r);const signal=options.signal?AbortSignal.any([options.signal,lifetime.signal]):lifetime.signal;
   try{
    checkAbort(signal);const job=plan.jobs.find(j=>j.id==='forgeryscope');requireValue(job?.params?.compare===false&&plan.width===record.surface.descriptor.width&&plan.height===record.surface.descriptor.height,'Actual automatic Forgeryscope plan and native grid required.');
    const mode=options.cloneWindowMode??plan.cloneWindowMode??task.cloneWindowMode??'independent';requireValue(['independent','global'].includes(mode),'Invalid native Forgeryscope window mode.');const key=JSON.stringify(job.params.excluded??[]);
    if(context)requireValue(key===inputKey,'A changed native exclusion set requires the parent automatic record to retire first.');
    if(!context){
     const d=original.surface.descriptor,domain=record.sourceRegionDomain?await compileOriginalSourceRegions(record.sourceRegionDomain):await compileOriginalSourceRegions((await createOriginalSourceRegionsState({sourceSha256:record.sha256,width:d.width,height:d.height})).snapshot()),regions=windows.map(w=>({id:w.id,kind:w.kind,polygon:w.polygon,x0:w.bounds[0],y0:w.bounds[1],x1:w.bounds[2],y1:w.bounds[3]})),excluded=shift(job.params.excluded,origin),fingerprint=await digest(['native-forgeryscope-geometric-acquisitions/1',record.sha256,domain.fingerprint,regions,excluded]);checkAbort(signal);
     const originalScope={schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',width:d.width,height:d.height,sourceSha256:record.sha256,fingerprint,status:'ready',nativePreparation:'acquisitions-only',regions,searchRegions:regions,excluded};
     const originalTask={id:task.id,imageId:task.imageId,operation:task.operation??'analysis.clones',cloneWindowMode:mode,params:{scientificScope:originalScope}},localTask=await localizeSourceRegionTask(originalTask,domain,{signal,strictAutomaticFragments:true});checkAbort(signal);
     const prepared=await prepareAutomaticStrictContext(record,localTask,{budget,signal});context=prepared;scope=localTask.params.scientificScope;inputKey=key;
     // The product analyzer is already configured with its native verified
     // assets/consent. A private test seal is never an admission requirement.
     provider=createAutomaticPreparedForgeryscope(analyzer,{budget,getContext:()=>context,admitGlobal:()=>true});checkAbort(signal);
    }
    output=await scopedAutomaticForgeryscope(record,{...plan,scientificScope:scope},{budget,signal,onProgress:options.onProgress,analyzer:{analyze:(pixels,params,hooks)=>provider.analyze(pixels,params,{...hooks,cloneWindowMode:mode})}});checkAbort(signal);
    requireValue(output.cloneWindowMode===mode&&output.metadata?.cloneWindowMode===mode,'Forgeryscope producer returned a contradictory executed mode.');
    output.provenance={...output.provenance,cloneWindowMode:output.cloneWindowMode,requestedParameters:job.params,nativePreparation:'geometric-acquisitions-only; unchanged native panel detector and ensemble',originalSelection:selection};returned=true;return output;
   }catch(error){failed=true;primary=error;throw error;}finally{try{if(!returned)await retireCompositeOwners([()=>output?.release()],failed?{primary}:{});}finally{active=false;finish();}}
  },
  dispose(){closed=true;lifetime.abort();if(closing)return closing;closing=(async()=>{await finished;await provider?.dispose();provider=null;await context?.release();context=null;if(!freed){freed=true;metadata();}})();void closing.finally(()=>closing=null).catch(()=>{});return closing;}
 };
}
