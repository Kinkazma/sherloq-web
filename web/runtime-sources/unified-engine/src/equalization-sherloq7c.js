import "../../runtime-context.js?v=0.31.0";
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {sherloq7cResultRecords} from './sherloq7c-adapter.js';
import {presentationSourceRows} from './sherloq7c-source-rows.js';
import {sherloq7cWindowHistogram} from './sherloq7c-window-records.js';

// Identity belongs to this fixed presentation/revision, never just the file SHA.
export async function prepareSherloq7cEqualization(source,plan,{budget,signal,onProgress,contains=()=>true,sherloqRuntime,sherloqSourceTransaction}={}){
 const {width,height}=source.descriptor,cooperate=createCooperator(signal),started=performance.now();
 let input,core,result,ownCore=false,closed=false,handedOff=false,format=source.descriptor.format??'rgb8';
 const native16=format==='rgb16',depth=native16?16:8;
 requireValue(['rgb8','rgb16'].includes(format),'Sherloq equalization requires an RGB8 or native RGB16 presentation.');
 const cleanup=async()=>{
  const errors=[];
  for(const retire of [async()=>{if(result){await result.release();result=null;}},async()=>{if(input){if(!sherloqSourceTransaction)await input.release();input=null;}},async()=>{if(ownCore){await core?.dispose();ownCore=false;}}])try{await retire();}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(errors,'Sherloq presentation retirement remains pending.');
 };
 try{
  // Keep D4's explicit refusal: a result mask cannot change graph observations.
  // A committed private hit has the same Original/runtime/scientific domain
  // and already passed this complete observation guard before publication.
  if(!sherloqSourceTransaction?.hit){for(let y=0;y<height;y++){for(let x=0;x<width;x++)if(!contains(x,y))throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','Sherloq equalization needs a separately qualified graph domain for excluded observations.');if((y&31)===0)await cooperate();}}
  if(sherloqRuntime)core=sherloqRuntime;else{const{createSherloq7C}=await import('./sherloq7c.js');core=createSherloq7C({budget});ownCore=true;}
  input=sherloqSourceTransaction?await sherloqSourceTransaction.source(()=>core.createSource(presentationSourceRows(source,{onProgress}),{signal})):await core.createSource(presentationSourceRows(source,{onProgress}),{signal});
  const settings=plan.state.sherloq7c;
  result=await core.run(input,{revelation:plan.value/100,micro:settings.micro/100,precision:settings.precision,maxSide:settings.maxSide,computationMode:settings.computationMode,prepareRevelationRange:settings.micro!==0},{signal,onProgress,backend:settings.computationMode==='fast'?'auto':settings.backend});checkAbort(signal);
  if(ownCore){
   // The final surface claim owns this standalone runtime through its ACK.
   const frozen=result,ownedCore=core;let resultRetired=false,coreRetired=false;
   result={...frozen,async release(){if(!resultRetired){await frozen.release();resultRetired=true;}if(!coreRetired){await ownedCore.dispose();coreRetired=true;}}};ownCore=false;
  }
  if(!sherloqSourceTransaction)await input.release();input=null;
  const metrics={...result.metrics,presentationSourceReuse:sherloqSourceTransaction?{upstreamHit:sherloqSourceTransaction.hit,sourceHit:sherloqSourceTransaction.hit,rangePreparationRequested:settings.micro!==0,maxSide:settings.maxSide,precision:settings.precision,programIdentity:sherloqSourceTransaction.programIdentity??null}:null,sourceBitDepth:depth,workingBitDepth:16,dynamicProxy:true,sourceRole:'computed-presentation',sourceFormat:format,originalPresentationDimensions:{width,height},outputDimensions:{width:result.width,height:result.height},coordinateDomain:result.width===width&&result.height===height?'native':'proxy-output',sourceToOutput:{x:result.width/width,y:result.height/height},outputToSource:{x:width/result.width,y:height/result.height},sourceRevision:source.descriptor.revision??null,sourceOwner:source.descriptor.id??null,promotion:native16?'none':'u8*257; normalized samples unchanged',original16Recovered:false,elapsedMs:performance.now()-started};
  return{method:'sherloq7c',value:plan.value,metrics,
   histogram(gray){requireValue(!closed&&!!result,'Sherloq equalization program released.');return sherloq7cWindowHistogram(result,gray,{budget,signal});},
   async takeRecords({threshold=255,invert=false}={}){
    requireValue(!closed&&!!result&&!handedOff,'Sherloq native output already transferred.');checkAbort(signal);
    if(threshold<255||invert)metrics.presentationFinish={threshold,invert,scalarStage:'before-finish'};
    const records=sherloq7cResultRecords(result,budget,{threshold,invert});records.planeRecords={sherloq7c_intensity:records.planeRecords.intensity,sherloq7c_rgb16:records.planeRecords.rgb16};handedOff=true;result=null;return records;
   },
   async dispose(){if(closed)return;await cleanup();closed=true;}
  };
 }catch(error){
  const previousRetry=error?.retryCleanup;const retry=async()=>{await previousRetry?.();await cleanup();};
  try{await retry();}catch(cleanupError){
   let primary=error;if(!primary||typeof primary!=='object'||!Object.isExtensible(primary)){primary=new AggregateError([error,cleanupError],'Sherloq preparation and retirement failed.',{cause:error});primary.code=error?.code??'CLEANUP_FAILED';}
   primary.cleanupError=cleanupError;primary.retryCleanup=retry;throw primary;
  }
  throw error;
 }
}
