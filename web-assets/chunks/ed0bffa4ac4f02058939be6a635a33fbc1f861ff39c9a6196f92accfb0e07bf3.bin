import "../../runtime-context.js?v=0.25.0";
import {Budget} from './cache.js';
import {resolveComputeProfile} from './profiles.js';
import {NeuralGraphPool} from './neural-graph-pool.js';
import {createNeuralTensor} from './neural-tensor-store.js';
import {createTemporarySession} from './temporary-storage.js';
import {ritaSessionCachePlan} from './rita-cache-plan.js';
import {ritaSourceTensors,ritaInitialMask} from './rita-source-tensors.js';
import {ritaSegmentedNetwork} from './rita-segmented-network.js';
import {renderRitaWindow} from './rita-render.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint,serializeEngineError} from './errors.js';
const MiB=1024**2,f=Math.fround;
// One storage retirement may report an error after releasing its backing.
// Remaining owners must still retire; never replace the original task failure.
async function retireRitaOwners(actions){
 const failures=[];for(const action of actions)try{await action();}catch(error){failures.push(error);}
 if(failures.length){const first=failures[0];if(failures.length>1&&first&&typeof first==='object'&&Object.isExtensible(first))first.details={...first.details,additionalCleanupErrors:failures.slice(1).map(error=>serializeEngineError(error))};throw first;}
}
const readonly=t=>Object.freeze({channels:t.channels,width:t.width,height:t.height,length:t.length,byteLength:t.byteLength,elementType:'Float32Array',get storage(){return t.storage;},readInto:t.readInto.bind(t),readBytes:t.readBytes.bind(t)});
/** Equal-logit ties preserve PyTorch argmax's lowest class index. The visual
 * score is a pairwise margin, not a calibrated probability of manipulation. */
export function ritaDisplayScore(logits,excludedClass,predictedClass){
 requireValue(logits.length===4,'Four finite RITA logits required.');for(let c=0;c<4;c++)requireValue(Number.isFinite(logits[c]),'Four finite RITA logits required.');
 if(!excludedClass)return 1;let other=-Infinity;for(let c=0;c<4;c++)if(c!==excludedClass)other=Math.max(other,logits[c]);const margin=other-logits[excludedClass];
 let score=f(margin>=0?1/(1+Math.exp(-margin)):Math.exp(margin)/(1+Math.exp(margin)));
 if(score===.5&&predictedClass===excludedClass)score=f(.5-2**-25);return score;
}
export function ritaSelectedStep(firstColumnEosStep,steps){requireValue(Number.isInteger(steps)&&steps>0,'RITA sequence must contain a step.');const signed=firstColumnEosStep===undefined?-1:firstColumnEosStep-1;return {signed,index:signed<0?steps-1:signed};}
/** Native segmented RITA. Only previous/selected steps survive; historical
 * logits are retired immediately and threshold changes reuse the final map. */
export function createRitaAnalyzer({segments,runtimes,budget,computeProfile='aggressive',resourceHints,createPool,network=ritaSegmentedNetwork}={}){
 requireValue(segments?.stages?.length===4,'Native segmented RITA manifest required.');const profile=resolveComputeProfile(computeProfile,resourceHints);budget??=new Budget(profile.memoryBudgetBytes);
 const manifest=structuredClone(segments);manifest.checkpointSha256??=manifest.checkpoint_sha256;const pool=createPool?createPool(budget,profile,{assets:manifest.assets,runtimes}):new NeuralGraphPool(budget,profile,{assets:manifest.assets,runtimes,resourceOwner:'rita',modelCacheBytes:0});let active,disposed=false,cached;
 async function unpin(item){if(--item.references===0)await retireRitaOwners([...item.tensors.map(t=>()=>t.dispose()),...(item.retainedStep?[()=>item.retainedStep.network.release(),()=>item.retainedStep.classes.dispose()]:[]),()=>item.session?.dispose()]);}
 async function retireCachedResult(){const old=cached;cached=null;if(old)await unpin(old);}
 async function clearCache(){await retireRitaOwners([retireCachedResult,()=>pool.clear()]);}
 function acquire(item,hit,image){item.references++;let released=false;return {data:{...item.data,metadata:structuredClone(item.data.metadata)},provenance:{...structuredClone(item.provenance),...(image?{sourceSurfaceIdentity:image.surface.descriptor.id+'/'+image.surface.descriptor.revision}:{})},metrics:{cache:{result:hit},execution:structuredClone(item.executions),executionResources:structuredClone(item.executionResources),temporaryStorage:item.session?{backend:item.session.backend,...item.session.snapshot()}:null,preflightExecutions:0,memory:budget.snapshot()},async release(){if(released)return;released=true;await unpin(item);}};}
 return {
  async analyze(image,params={},options={}){
   if(disposed)throw new EngineError('DISPOSED','RITA analyzer disposed.');if(active)throw new EngineError('BUSY','RITA analysis already running.');requireValue(image.surface&&Object.keys(params).every(k=>k==='threshold')&&(params.threshold===undefined||Number.isFinite(params.threshold)&&params.threshold>=0&&params.threshold<=1),'RITA requires an original source surface; threshold is a visual setting.');
   const d=image.surface.descriptor,immutable=options.immutableSource===true&&image.segmented&&/^[a-f0-9]{64}$/.test(image.sha256),identity=immutable?['original-blob',image.sha256,d.width,d.height,d.format??null]:[image.sha256,d.id,d.revision,d.width,d.height],key=JSON.stringify([...identity,options.backend??'auto',manifest.checkpointSha256]),controller=new AbortController(),abort=()=>controller.abort();let finish;const done=new Promise(resolve=>finish=resolve);active={abort,done};options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();const signal=controller.signal;
   let session,sessionPending,committed=false,retainedStep,sessionCachePlan,primaryError;const tensors=new Set(),steps=new Set(),invariantFeatures=new Map();
   const getTemporarySession=async()=>{if(session)return session;if(!sessionPending)sessionPending=createTemporarySession({budget,signal}).then(s=>session=s);return sessionPending;};
   const make=async(c,h,w)=>{const storage=c*h*w*4>Math.min(budget.limit/12,Math.max(0,budget.limit-budget.total())/4)?'temporary':'memory',t=await createNeuralTensor(c,h,w,{budget,signal,storage,getTemporarySession,owner:'rita',label:'rita-scientific-plane',cooperation:'bounded'});tensors.add(t);return t;};
   const drop=async t=>{if(tensors.delete(t))await t.dispose();};
   const dropStep=async step=>{if(steps.delete(step)){await retireRitaOwners([()=>step.network.release(),()=>drop(step.classes)]);}};
   try{
    checkAbort(signal);if(cached?.key===key)return acquire(cached,true,image);await retireCachedResult();sessionCachePlan=ritaSessionCachePlan(manifest,{width:d.width,height:d.height,budgetBytes:budget.limit,backend:options.backend??'auto',cpuOnly:pool.cpuOnly});pool.modelCacheBytes=sessionCachePlan.modelCacheBytes;const source=ritaSourceTensors(image,{budget}),{paddedWidth:pw,paddedHeight:ph,width,height}=source,n=pw*ph,records=[];let previous,chosen,firstColumnEosStep;
    const hints={manifest,pool,budget,getTemporarySession,signal,invariantFeatures,backend:options.backend??'auto',onProgress:options.onProgress};
    for(let iteration=0;iteration<10;iteration++){
     checkAbort(signal);const result=await network(source.rgb,previous?.classes??ritaInitialMask(pw,ph,{budget}),iteration,hints),step={network:result,classes:null,index:iteration};steps.add(step);step.classes=await make(1,ph,pw);const eosCounts=new Uint32Array(pw),counts=[0,0,0,0],blockRows=Math.max(1,Math.floor(4*MiB/(pw*4*4)));
     for(let top=0;top<ph;top+=blockRows){await controlCheckpoint(signal);const rows=Math.min(blockRows,ph-top),part=await result.logits.readRows(top,rows,{signal}),release=budget.reserve(rows*pw*4);
      try{const pixels=rows*pw,labels=new Float32Array(pixels);for(let i=0;i<pixels;i++){let best=0;for(let c=0;c<4;c++){const value=part.data[c*pixels+i];requireValue(Number.isFinite(value),'RITA produced nonfinite logits.');if(value>part.data[best*pixels+i])best=c;}labels[i]=best;counts[best]++;if(best===2)eosCounts[i%pw]++;}await step.classes.writeRows(top,rows,labels,{signal});}finally{release();part.release();}
     }
     step.classes.markCold?.();const columnEos=eosCounts.some(count=>f(count/ph)>=f(.9)),allEos=counts[2]===n;records.push({iteration,classCounts:counts,columnEos,allEos,executions:result.executions,executionResources:result.executionResources});
     if(firstColumnEosStep===undefined&&columnEos){firstColumnEosStep=iteration;if(iteration>0)chosen=previous;}
     const lastMode=firstColumnEosStep===undefined||firstColumnEosStep===0;if(lastMode)chosen=step;
     const old=previous;previous=step;if(old&&old!==chosen)await dropStep(old);
     options.onProgress?.({phase:'rita-autoregressive-step',completed:iteration+1,total:10,columnEos,allEos,selectedStepSoFar:chosen.index});if(allEos)break;
    }
    const selection=ritaSelectedStep(firstColumnEosStep,records.length);requireValue(chosen?.index===selection.index,'RITA official output-step selection diverged.');
    for(const step of [...steps])if(step!==chosen)await dropStep(step);
    let maximum=null;const scanRows=Math.max(1,Math.floor(4*MiB/(pw*4)));
    for(let top=0;top<ph;top+=scanRows){const part=await chosen.classes.readRows(top,Math.min(scanRows,ph-top),{signal});try{for(const value of part.data)if(value!==3)maximum=maximum===null?value:Math.max(maximum,value);}finally{part.release();}}
    const reuseNative=width===pw&&height===ph,map=await make(1,height,width),official=await make(1,height,width),labels=reuseNative?chosen.classes:await make(1,height,width),logits=reuseNative?chosen.network.logits:await make(4,height,width),blockRows=Math.max(1,Math.floor(4*MiB/(pw*4*8)));
    for(let top=0;top<height;top+=blockRows){await controlCheckpoint(signal);const rows=Math.min(blockRows,height-top),values=await chosen.network.logits.readRows(top,rows,{signal});let classes,release;
     try{classes=await chosen.classes.readRows(top,rows,{signal});release=budget.reserve(rows*width*(reuseNative?2:7)*4);const count=rows*width,scoreData=new Float32Array(count),officialData=new Float32Array(count),labelData=reuseNative?null:new Float32Array(count),logitData=reuseNative?null:new Float32Array(count*4),four=new Float32Array(4);
      for(let y=0;y<rows;y++)for(let x=0;x<width;x++){const input=y*pw+x,at=y*width+x,label=classes.data[input];if(labelData)labelData[at]=label;officialData[at]=maximum?Number(label!==maximum):1;for(let c=0;c<4;c++){four[c]=values.data[c*rows*pw+input];if(logitData)logitData[c*count+at]=four[c];}scoreData[at]=ritaDisplayScore(four,maximum,label);requireValue((scoreData[at]>=.5)===!!officialData[at],'RITA visual score changed the official threshold0.5 mask.');}
      await map.writeRows(top,rows,scoreData,{signal});await official.writeRows(top,rows,officialData,{signal});if(!reuseNative){await labels.writeRows(top,rows,labelData,{signal});await logits.writeRows(top,rows,logitData,{signal});}
     }finally{release?.();classes?.release();values.release();}
    }
    map.markCold?.();official.markCold?.();labels.markCold?.();logits.markCold?.();if(reuseNative){retainedStep=chosen;steps.delete(chosen);tensors.delete(chosen.classes);}else await dropStep(chosen);checkAbort(signal);const metadata={...source.metadata,coordinateSpace:'source-pixels',attention:'global RGB/mask token field',storage:'lossless segmented float32',dtype:'float32',maximumSteps:10,generatedSteps:records.length,selectedStep:selection.index,selectedStepSigned:selection.signed,firstColumnEosStep:firstColumnEosStep??null,excludedLabel:maximum,selectedNativeBackingsReused:reuseNative,selection:'first padded column with>=90%EOS; preceding step, negative index selects last',scoreSemantics:'uncalibrated logistic margin: strongest other class minus excluded-label logit; threshold0.5 exactly reproduces the official categorical mask',threshold:.5};
    const executions=records.flatMap(r=>r.executions),executionResources={sessionCachePlan,requestedWorkers:profile.maxWorkers,maximumCpuGranted:Math.max(0,...records.map(r=>r.executionResources?.maximumCpuGranted??0)),maximumGpuGranted:Math.max(0,...records.map(r=>r.executionResources?.maximumGpuGranted??0)),maximumWasmThreads:Math.max(0,...records.map(r=>r.executionResources?.maximumWasmThreads??0)),sessionCacheHits:records.reduce((n,r)=>n+(r.executionResources?.sessionCacheHits??0),0),maximumSessionCacheBytes:Math.max(0,...records.map(r=>r.executionResources?.maximumSessionCacheBytes??0)),gpuBufferLedgerObserved:records.some(r=>r.executionResources?.gpuBufferLedgerObserved===true),maximumWorkerGpuBufferBytes:Math.max(0,...records.map(r=>r.executionResources?.maximumWorkerGpuBufferBytes??0)),maximumWorkerGpuAdmissionBytes:Math.max(0,...records.map(r=>r.executionResources?.maximumWorkerGpuAdmissionBytes??0)),unmeasuredGpuTextureStorage:records.some(r=>r.executionResources?.unmeasuredGpuTextureStorage===true),driverPrivateBytes:null,queryTransportJobs:records.reduce((n,r)=>n+(r.executionResources?.queryTransportJobs??0),0),queryLogicalExecutions:records.reduce((n,r)=>n+(r.executionResources?.queryLogicalExecutions??0),0)},item={key,references:1,tensors:[...tensors],retainedStep,get session(){return session;},executions,executionResources,data:{width,height,segmented:true,map:readonly(map),official_mask:readonly(official),labels:readonly(labels),logits:readonly(logits),metadata},provenance:{originalSourceSha256:image.sha256??null,sourceSurfaceIdentity:d.id+'/'+d.revision,checkpointSha256:manifest.checkpointSha256,provider:[...new Set(executions.map(e=>e.provider))].join('+'),qualification:manifest.qualification??'native geometric adaptation; see numerical qualification'}};
    cached=item;committed=true;tensors.clear();return acquire(item,false);
   }catch(error){primaryError=error;throw error;}finally{
    const actions=committed?[]:[...[...steps].map(step=>()=>dropStep(step)),...[...tensors].map(t=>()=>drop(t)),...(retainedStep?[()=>retainedStep.network.release(),()=>retainedStep.classes.dispose()]:[])];
    actions.push(...[...new Set(invariantFeatures.values())].map(feature=>()=>feature.dispose()),()=>invariantFeatures.clear());if(!committed)actions.push(()=>session?.dispose());
    try{await retireRitaOwners(actions);}catch(cleanup){if(!primaryError)throw cleanup;if(primaryError&&typeof primaryError==='object'&&Object.isExtensible(primaryError))primaryError.details={...primaryError.details,cleanup:serializeEngineError(cleanup)};}
    finally{active=null;options.signal?.removeEventListener('abort',abort);finish();}
   }
  },
  render(image,result,view,options={}){return renderRitaWindow(image,result,view,undefined,{...options,budget});},
  renderWindow(image,result,view,rect,options={}){return renderRitaWindow(image,result,view,rect,{...options,budget});},
  clearCache,
  async dispose(){if(disposed)return;disposed=true;active?.abort();await retireRitaOwners([()=>active?.done,clearCache,()=>pool.dispose()]);},
  memory(){return budget.snapshot();}
 };
}
