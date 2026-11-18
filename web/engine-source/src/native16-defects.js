import {EngineError,requireValue,checkAbort} from './errors.js';
import {defectParams} from './defect-pixels.js';
import {native16Descriptor} from './rgb16-surface.js';
import {segmentedDefects,segmentedDefectsExecutionPlan} from './segmented-defects.js';
import {createNative16DisplayOwner,native16DisplayPlan} from './native16-display-owner.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {withRetirementOwner} from './owner-retirement-error.js';

export const native16DefectsParams=defectParams;
const bytesOf=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
const ack=async action=>{const reply=await action();if(reply===false||reply===0)throw new EngineError('SOURCE_WINDOW_RETIREMENT_FAILED','The Source window has not acknowledged retirement.');};
function geometry(surface,options,p){
 const d=surface?.descriptor;requireValue(d?.format==='rgb16'&&d.depth===16&&typeof surface.readWindow==='function','Defects requires a real RGB16 Source.');
 const original=options.sourceSurface??surface,step=options.presentationGrid?.step??1,sdr=options.presentationSurface;
 requireValue(Number.isSafeInteger(step)&&step>0,'Invalid defect presentation grid.');
 if(p.mode===0)requireValue(sdr?.descriptor?.format==='rgb8'&&Math.ceil(sdr.descriptor.width/step)===d.width&&Math.ceil(sdr.descriptor.height/step)===d.height&&typeof sdr.readWindow==='function'&&(step===1||typeof sdr.readSampledWindow==='function'),'Native16 marker background must be the captured Original SDR on the same sampling grid.');
 return {d,original,step,sdr};
}
function nativeReadBytes(surface,y,height){
 const d=surface.descriptor,rect={x:0,y,width:d.width,height},plan=surface.readWindowPlan?.(rect);
 if(plan)requireValue(plan.known===true&&Number.isSafeInteger(plan.additionalBytes)&&plan.additionalBytes>=0,'Native16 defect Source read plan is unavailable.');
 return (typeof surface.readWindowInto==='function'?0:d.width*height*6)+(plan?.additionalBytes??Math.max(d.sourceWidth??d.width,d.sourceHeight??d.height)*6);
}
function presentationReadBytes(sdr,step,y,height,w){
 if(!sdr)return 0;
 if(step===1){const plan=sdr.readWindowPlan?.({x:0,y,width:w,height});if(plan)requireValue(plan.known===true&&Number.isSafeInteger(plan.additionalBytes)&&plan.additionalBytes>=0,'Defect SDR read plan is unavailable.');return w*height*3+(plan?.additionalBytes??Math.max(sdr.descriptor.sourceWidth??w,sdr.descriptor.sourceHeight??height)*3);}
 // sampleStoredPixels owns the sampled destination and one physical scanline.
 // A Source-specific plan may add its own pin/IO cost to that concrete sampler.
 const d=sdr.descriptor,tile={x:0,y:y*step,w:d.width,h:Math.min(height*step,d.height-y*step),step},plan=sdr.readSampledWindowPlan?.(tile);
 if(plan)requireValue(plan.known===true&&Number.isSafeInteger(plan.additionalBytes)&&plan.additionalBytes>=0,'Defect sampled SDR read plan is unavailable.');
 return w*height*3+(plan?.additionalBytes??Math.max(d.sourceWidth??d.width,d.sourceHeight??d.height)*3);
}
export function native16DefectsAdmissionPlan(surface,input={},options={}){
 try{
  const p=defectParams(input),{d,original,step,sdr}=geometry(surface,options,p),n=d.width*d.height,effective={...p,threshold:p.threshold*257,spread:p.spread*257};
  const execution=segmentedDefectsExecutionPlan({width:d.width,height:d.height,params:effective,sampleDepth:16,rowsPerBlock:options.rowsPerBlock,candidateCount:options.candidateCount??3*n,ioBytes:options.ioBytes??0,
   sourceReadBytes:(y,h)=>nativeReadBytes(surface,y,h),presentationReadBytes:(y,h)=>presentationReadBytes(sdr,step,y,h,d.width)});
  const display=p.mode===2?native16DisplayPlan(original.descriptor,{totalPixels:n,backend:options.colorBackend??'auto',displayAssumption:options.displayAssumption}):null;
  if(display&&!display.known)return display;
  const displayBytes=display?display.bytes+display.surfaceReadBytes+Math.max(d.width,d.height)*6:0,bytes=(options.runtimeBytes??0)+execution.additionalBytes+(options.storageOverheadBytes??0)+displayBytes;
  return {known:execution.known,bytes,completeResidentAlternative:true,execution,display,outputPrecision:p.mode===2?16:8,scientificInputPrecision:16};
 }catch{return {known:false,reason:'native16-defects-plan-uninspectable'};}
}

// The final never owns/disposes the Original. Only temporary borrowed windows
// and the final's own stores and color presentation are retired here.
export async function runNative16Defects(surface,input={},options={}){
 const p=defectParams(input),{d,original,step,sdr}=geometry(surface,options,p),{budget,signal,onProgress,rowsPerBlock}=options;
 requireValue(budget?.reserve,'A shared defect memory budget is required.');
 const check=()=>{checkAbort(signal);if(options.isSourceCurrent&&options.isSourceCurrent(options.sourceBinding)===false)throw new EngineError('SOURCE_CHANGED','The captured defect Original changed.');};
 let display,record,sourceReads=0,sourceBytes=0,presentationReads=0,presentationBytes=0;
 async function copyRead(read,Type,target,length){
  check();let frame,primary;
  try{frame=await read();requireValue(frame?.pixels?.data instanceof Type&&frame.pixels.data.length===length,'Invalid typed defect Source window.');if(frame.pixels.data.buffer!==target.buffer||frame.pixels.data.byteOffset!==target.byteOffset)bytesOf(target).set(bytesOf(frame.pixels.data));check();}
  catch(error){primary=error;}
  if(frame){
   let child,flight,done=false;
   const loan={dispose(){if(done)return Promise.resolve();if(flight)return flight;const task=(async()=>{if(child){await ack(()=>child.dispose());child=null;}try{await ack(()=>frame.release?.());}catch(error){child=error?.cleanupOwner;throw error;}frame=null;done=true;})();flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;}};
   try{await loan.dispose();}catch(cleanup){throw withRetirementOwner(primary??cleanup,loan,cleanup);}
  }
  if(primary)throw primary;check();
 }
 const image={surface:{descriptor:{...d,sourceWidth:d.width,sourceHeight:d.height,orientation:1}},
  session:options.temporarySession,get ensureTemporarySession(){return options.getTemporarySession;},
  store:{async readInto(target,offset){const rowBytes=d.width*6;requireValue(target instanceof Uint8Array&&offset%rowBytes===0&&target.byteLength%rowBytes===0,'Invalid defect native band.');const y=offset/rowBytes,height=target.byteLength/rowBytes;
   const rect={x:0,y,width:d.width,height},into=typeof surface.readWindowInto==='function';requireValue(target.byteOffset%2===0,'Invalid aligned defect native destination.');const destination=new Uint16Array(target.buffer,target.byteOffset,target.byteLength/2);
   await copyRead(()=>into?surface.readWindowInto(rect,destination,{signal}):surface.readWindow(rect,{signal}),Uint16Array,target,d.width*height*3);sourceReads++;sourceBytes+=target.byteLength;return target;}}};
 const presentationStore=p.mode===0?{async readInto(target,offset){const y=offset/(d.width*3),height=target.length/(d.width*3);requireValue(Number.isSafeInteger(y)&&Number.isSafeInteger(height),'Invalid defect SDR band.');
  const read=step===1?()=>sdr.readWindow({x:0,y,width:d.width,height},{signal}):()=>sdr.readSampledWindow({x:0,y:y*step,w:sdr.descriptor.width,h:Math.min(height*step,sdr.descriptor.height-y*step),step},{signal});
  await copyRead(read,Uint8Array,target,target.length);presentationReads++;presentationBytes+=target.byteLength;return target;}}:undefined;
 try{
  check();if(p.mode===2){requireValue(options.sourceBinding&&typeof options.isSourceCurrent==='function','Native16 correction requires captured Original color authority.');display=createNative16DisplayOwner({nativeSource:original,budget,sourceBinding:options.sourceBinding,isCurrent:options.isSourceCurrent,displayAssumption:options.displayAssumption,totalPixels:d.width*d.height,backend:options.colorBackend??'auto'});}
  const effective={...p,threshold:p.threshold*257,spread:p.spread*257};
  record=await segmentedDefects(image,effective,{budget,signal,onProgress,rowsPerBlock,forceExternalSort:options.forceExternalSort,sampleDepth:16,candidateParams:p,presentationStore,
   sourceReadBytes:(y,h)=>nativeReadBytes(surface,y,h),presentationReadBytes:(y,h)=>presentationReadBytes(sdr,step,y,h,d.width),
   rgb16Options:{sourceDepth:d.sourceDepth,color:d.color,provenance:d.provenance,displayTransform:display?.displayTransform}});
  if(display){display.attach(record.surface);display=null;}check();
  const owned=[record.surface,...Object.values(record.maskRecords??{}).map(x=>x.surface),...Object.values(record.flagRecords??{}).map(x=>x.surface),...Object.values(record.tableRecords??{}).map(x=>x.surface)];let flight,closed=false,debt;
  record.dispose=()=>{if(closed)return Promise.resolve();if(flight)return flight;const task=(async()=>{try{if(debt){await debt.dispose();debt=null;}else await retireCompositeOwners(owned.map(owner=>()=>owner.dispose()));closed=true;}catch(error){debt=error?.cleanupOwner??debt;throw withRetirementOwner(error,record,error);}})();flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;};
  record.data={...record.data,requestedParams:{...p},effectiveParams:effective,valueUnits:'unsigned native16 codes',outputPrecision:p.mode===2?16:8};
  record.metrics={...record.metrics,backend:'cpu',inputDepth:16,outputDepth:p.mode===2?16:8,nativePrecision:16,presentationPrecision:8,sourceReads,sourceBytes,presentationReads,presentationBytes,nativeComputations:1};
  record.provenance={...record.provenance,...native16Descriptor(surface),schema:'sherloq.native-input/1',operation:'pixels.defects',numericalInputDepth:16,presentationOutputDepth:8,scientificOutputDepth:p.mode===2?16:8,profileConversion:'none-native-coded-defect-domain',inputPrecision:16,outputPrecision:p.mode===2?16:8,thresholdScale:257,candidateValueUnits:'unsigned native16 codes',candidateParameterUnits:'UI byte units',sourceBinding:options.sourceBinding??null,sourceSamplesPreserved:true,diagnosis:'isolated pixel candidates; not a RAW sensor diagnosis'};
  return record;
 }catch(primary){
  const owned=record?[record.surface,...Object.values(record.maskRecords??{}).map(x=>x.surface),...Object.values(record.flagRecords??{}).map(x=>x.surface),...Object.values(record.tableRecords??{}).map(x=>x.surface)]:[];
  await retireCompositeOwners([...owned.map(owner=>()=>owner.dispose()),()=>display?.dispose()],{primary});throw primary;
 }
}
