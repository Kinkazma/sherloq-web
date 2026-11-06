import {renderEnergy} from './energy-render.js?v=0.32.0';
import {readEnergyWindow,sampleEnergyField} from './energy-native-fields.js?v=0.32.0';
import {EngineError,checkAbort,createCooperator} from './unified-engine/src/errors.js';
import {numericPlaneSamplePlan} from './unified-engine/src/numeric-plane-sampling.js';
import {ADAPTIVE_PREVIEW_MAX_SIDE} from './preview-limits.js?v=0.32.0';
const fields=view=>view==='scores'?['energy_scope','energy_high_score','energy_low_score']:['energy_labels'];
const nativePanels=(both,width,height)=>both?{panels:['high','low'].map((field,index)=>({field,x:index*width,y:0,width,height}))}:{};
const paletteEntries=(analysis,presentation)=>presentation.view==='scores'?0:analysis.data.regionColors?.length??0;
function sampledSpan(width,paneWidth,limit){if(width<=limit)return Math.floor((paneWidth-.5)*width/paneWidth)-Math.floor(.5*width/paneWidth)+1;let maximum=0;for(let start=0;start<paneWidth;){const x0=Math.floor((start+.5)*width/paneWidth);let end=start+1;while(end<paneWidth&&Math.floor((end+.5)*width/paneWidth)-x0<limit)end++;maximum=Math.max(maximum,Math.floor((end-.5)*width/paneWidth)-x0+1);start=end;}return maximum;}
/** Peak live scratch, excluding an RGB result already admitted by the caller.
 * Numeric samples coexist until rendering; native bands do not. JS palette
 * entries use a conservative metadata allowance in addition to typed buffers. */
export function energySurfaceWorkingBytes({width,height,paneWidth,outputHeight,fieldCount,sampled,paletteEntries=0,needsSource=true}){
 const paletteBytes=paletteEntries*128+65536;
 if(!sampled)return Math.min(262144,width*Math.min(128,height))*(fieldCount*4+9)+paletteBytes;
 const pixels=paneWidth*outputHeight,numericBytes=pixels*fieldCount*4,sourceBytes=needsSource?pixels*3:0,numericWindow=sampledSpan(width,paneWidth,262144)*4,sourceWindow=needsSource?sampledSpan(width,paneWidth,87381)*3:0;
 return Math.max(numericBytes+numericWindow,numericBytes+sourceBytes+sourceWindow)+paletteBytes;
}
function previewMemoryAtBounds(analysis,presentation,preview,memory,{directNumericSampling=true,prepaidNumericWorkspace=false,rgbBudgetReserved=true}={}){
 const {width,height}=analysis.data,panels=presentation.view==='scores'&&presentation.field==='both'?2:1,needsSource=presentation.view==='scores'?(presentation.scoreView??'map')==='overlay':(presentation.view??'overlay')==='overlay',names=fields(presentation.view),scale=Math.min(1,preview.maxWidth/(width*panels),preview.maxHeight/height),paneWidth=Math.max(1,Math.floor(width*scale)),outputHeight=Math.max(1,Math.floor(height*scale)),outputWidth=paneWidth*panels,sampled=paneWidth!==width||outputHeight!==height,frameBytes=outputWidth*outputHeight*3,knownHeapBytes=Math.ceil(memory.knownHeapCapacityBytes),availableBytes=Math.floor(memory.policyAvailableBytes),frameLeaseBytes=(rgbBudgetReserved?0:frameBytes)+energySurfaceWorkingBytes({width,height,paneWidth,outputHeight,fieldCount:names.length,sampled,paletteEntries:paletteEntries(analysis,presentation),needsSource});
 const columns=Math.min(width,262144),rows=Math.max(1,Math.min(128,Math.floor(262144/columns),height)),legacyWindowBytes=sampled?Math.max(sampledSpan(width,paneWidth,262144)*4,needsSource?sampledSpan(width,paneWidth,87381)*3:0):columns*rows*4,requiredBytes=frameLeaseBytes+knownHeapBytes+legacyWindowBytes;
 let samplerBytes=0,samplerScratchBytes=0,samplerOutputBytes=0,directRequiredBytes=null,directSamplingAdmitted=false,directDecline=sampled?'unavailable':'native-bands';
 if(sampled&&directNumericSampling){try{for(const name of names){const surface=analysis.planeSurfaces?.[name]??(name==='energy_low_score'?analysis.surface:null);if(!surface){directDecline='surface';samplerBytes=0;break;}const plan=numericPlaneSamplePlan(surface,{sourceWidth:width,sourceHeight:height,width:paneWidth,height:outputHeight,centers:true});samplerBytes=Math.max(samplerBytes,plan.requiredBytes);samplerScratchBytes=Math.max(samplerScratchBytes,plan.scratchBytes+plan.coordinateBytes);samplerOutputBytes+=plan.outputBytes;}if(samplerBytes){const parentCovered=prepaidNumericWorkspace&&samplerOutputBytes+samplerScratchBytes<=frameLeaseBytes;directRequiredBytes=frameLeaseBytes+Math.max(32*1024**2,knownHeapBytes)+(parentCovered?0:samplerBytes);directSamplingAdmitted=directRequiredBytes<=availableBytes;directDecline=directSamplingAdmitted?null:'working-memory';}}catch(error){if(error?.code!=='UNSUPPORTED_LAYOUT')throw error;samplerBytes=0;directDecline=error.details?.samplePlane?.reason??'layout';}}
 const transportBytes=2*1024**2,batchWindowBytes=Math.max(Math.min(262144,width*height)*4,needsSource?Math.min(87381,width*height)*3:0),batchPeak=Math.max(frameLeaseBytes+transportBytes+knownHeapBytes+batchWindowBytes,directSamplingAdmitted?directRequiredBytes+transportBytes:0),batch=sampled&&batchPeak<=availableBytes;
 if(batch&&directRequiredBytes!==null)directRequiredBytes+=transportBytes;
 return{width:outputWidth,height:outputHeight,paneWidth,outputPixels:outputWidth*outputHeight,numericPixels:paneWidth*outputHeight,sampled,frameBytes,frameLeaseBytes,knownHeapBytes,legacyWindowBytes,samplerBytes,samplerOutputBytes,samplerScratchBytes,prepaidNumericWorkspace,requiredBytes,availableBytes,batch,batchBytes:batch?transportBytes:0,peakBytes:batch?batchPeak:directSamplingAdmitted?directRequiredBytes:requiredBytes,directRequiredBytes,directSamplingAdmitted,directDecline};
}
/** Memory admission only. The optional direct reader/batch never lowers quality.
 * Native final calls have no preview and do not enter this planner. */
export function admitEnergySurfacePreview(analysis,presentation={}, {preview,memory,directNumericSampling=true,prepaidNumericWorkspace=false,rgbBudgetReserved=true}={}){
 if(!preview)return{applicable:false,admitted:true,maxSide:null,constrainedByMemory:false,reason:'native-final'};
 const requestedSide=Math.min(preview.maxWidth,preview.maxHeight),panels=presentation.view==='scores'&&presentation.field==='both'?2:1,minimumSide=panels;
 if(!Number.isSafeInteger(requestedSide)||requestedSide<minimumSide||requestedSide>ADAPTIVE_PREVIEW_MAX_SIDE||preview.maxWidth!==preview.maxHeight)throw new EngineError('INVALID_INPUT','A bounded proportional Energy preview side is required.');
 const guard=reason=>({applicable:false,admitted:true,maxSide:requestedSide,requestedSide,constrainedByMemory:false,reason});
 if(!analysis?.planeSurfaces||analysis.data?.contextLayout||Array.isArray(analysis.data?.contexts)||Array.isArray(analysis.data?.metadata?.fragments))return guard('unsupported-context-or-contiguous');
 const {width,height}=analysis.data;if(![width,height,width*panels].every(v=>Number.isSafeInteger(v)&&v>0)||!Number.isSafeInteger(width*height))throw new EngineError('INVALID_INPUT','Invalid native Energy presentation dimensions.');
 if(!Number.isFinite(memory?.policyAvailableBytes)||memory.policyAvailableBytes<0||!Number.isFinite(memory?.knownHeapCapacityBytes)||memory.knownHeapCapacityBytes<0||![Math.floor(memory.policyAvailableBytes),Math.ceil(memory.knownHeapCapacityBytes)].every(Number.isSafeInteger))return guard('memory-unavailable');
 const evaluate=side=>previewMemoryAtBounds(analysis,presentation,{maxWidth:side,maxHeight:side},memory,{directNumericSampling,prepaidNumericWorkspace,rgbBudgetReserved}),full=evaluate(requestedSide),finish=(side,value)=>({...value,applicable:true,admitted:true,maxSide:side,maxPixels:value.outputPixels,requestedSide,constrainedByMemory:side<requestedSide,reason:side<requestedSide?'memory-capacity':'admitted'});
 if(full.requiredBytes<=full.availableBytes)return finish(requestedSide,full);
 // The native-band point is separate: a smaller sampled frame can own more
 // scratch than a complete native band. Search only the sampled interval.
 const upper=Math.min(requestedSide,Math.max(width*panels,height)-1);let low=minimumSide,high=upper,best=null;
 while(low<=high){const side=low+Math.floor((high-low)/2),value=evaluate(side);if(value.requiredBytes<=value.availableBytes){best={side,value};low=side+1;}else high=side-1;}
 // Sparse, very wide X segments can change span at a split boundary. Keep the
 // maximum exact in this bounded4096-side case without assuming that span.
 if(width>87381)for(let side=upper;side>(best?.side??minimumSide-1);side--){const value=evaluate(side);if(value.requiredBytes<=value.availableBytes){best={side,value};break;}}
 if(!best)throw new EngineError('MEMORY_LIMIT','No proportional Energy preview grid fits the available Core workspace.',{details:{previewMemoryAdmission:{requestedSide,availableBytes:full.availableBytes,knownHeapBytes:full.knownHeapBytes,minimumSide}}});
 return finish(best.side,best.value);
}
/** Presentation adapter only: unchanged renderEnergy formulas, exact native
 * bands, one bounded plane window at a time and a separate sampled drag frame. */
export async function renderEnergySurface(analysis,source,presentation={}, {engine,signal,preview,observedMaxima,signedRanges,rgbBudgetReserved=false}={}){
 const cooperate=createCooperator(signal),needsSource=presentation.view==='scores'?(presentation.scoreView??'map')==='overlay':(presentation.view??'overlay')==='overlay';
 const {width,height}=analysis.data,both=presentation.view==='scores'&&presentation.field==='both',panels=both?2:1,names=fields(presentation.view),logicalWidth=width*panels;
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||source.width!==width||source.height!==height)throw new EngineError('INVALID_INPUT','Energy presentation source grid differs.');
 const scale=preview?Math.min(1,preview.maxWidth/logicalWidth,preview.maxHeight/height):1,paneWidth=Math.max(1,Math.floor(width*scale)),outputHeight=Math.max(1,Math.floor(height*scale)),outputWidth=paneWidth*panels,sampled=paneWidth!==width||outputHeight!==height,bytes=outputWidth*outputHeight*3;
 const scratch=energySurfaceWorkingBytes({width,height,paneWidth,outputHeight,fieldCount:names.length,sampled,paletteEntries:paletteEntries(analysis,presentation),needsSource}),baseBytes=(rgbBudgetReserved?0:bytes)+scratch,transportBytes=2*1024**2;let batched=false,lease;
 // Extra transport is optional and preflighted without reclaiming caches.
 // A refusal keeps the historical one-native-row windows and the same grid.
 if(sampled&&typeof engine.capabilities==='function'){const capability=await engine.capabilities(),memory=capability.memory;if(Number.isFinite(memory?.policyAvailableBytes)&&Number.isFinite(memory?.knownHeapCapacityBytes)&&memory.policyAvailableBytes>=0&&memory.knownHeapCapacityBytes>=0)batched=previewMemoryAtBounds(analysis,presentation,preview,memory,{directNumericSampling:typeof engine.samplePlane==='function',prepaidNumericWorkspace:capability.sourceAccess?.numericSamplingExternalWorkspace===true,rgbBudgetReserved}).batch;checkAbort(signal);}
 try{lease=await engine.reserveExternalMemory({bytes:baseBytes+(batched?transportBytes:0)});}catch(error){checkAbort(signal);if(!batched||error?.code!=='MEMORY_LIMIT')throw error;batched=false;lease=await engine.reserveExternalMemory({bytes:baseBytes});}
 try{
  if(sampled){const data={...analysis.data,width:paneWidth,height:outputHeight},numericSampling=[];for(const name of names)data[name]=await sampleEnergyField(analysis,name,{width:paneWidth,height:outputHeight,centers:true,maxWindowRows:batched?height:1},{engine,signal,workspaceReservationId:lease.id,onSampling:metrics=>numericSampling.push({field:name,...metrics})});
   // One bounded sampled source request avoids per-pixel RPCs; choose the same
   // center coordinates as renderEnergy's established drag presentation.
   let rgb;
   if(needsSource){
    rgb=new Uint8Array(paneWidth*outputHeight*3);
    if(!batched){
     for(let y=0;y<outputHeight;y++){await cooperate();checkAbort(signal);const sy=Math.min(height-1,Math.floor((y+.5)*height/outputHeight));for(let start=0;start<paneWidth;){let end=start+1;const x0=Math.floor((start+.5)*width/paneWidth);while(end<paneWidth&&Math.floor((end+.5)*width/paneWidth)-x0<87381)end++;const x1=Math.floor((end-.5)*width/paneWidth),row=await source.readPixels({x:x0,y:sy,width:x1-x0+1,height:1});checkAbort(signal);for(let x=start;x<end;x++){const a=(Math.floor((x+.5)*width/paneWidth)-x0)*3,b=(y*paneWidth+x)*3;rgb[b]=row.data[a];rgb[b+1]=row.data[a+1];rgb[b+2]=row.data[a+2];}start=end;}}
    }else{
    const xs=Array.from({length:paneWidth},(_,x)=>Math.floor((x+.5)*width/paneWidth)),ys=Array.from({length:outputHeight},(_,y)=>Math.min(height-1,Math.floor((y+.5)*height/outputHeight)));
    for(let start=0;start<paneWidth;){let end=start+1;const x0=xs[start];while(end<paneWidth&&xs[end]-x0<87381)end++;const span=xs[end-1]-x0+1;
     async function sampleRows(top,bottom){await cooperate();checkAbort(signal);const y0=ys[top],rows=ys[bottom-1]-y0+1;let row;
      try{row=await source.readPixels({x:x0,y:y0,width:span,height:rows});}
      catch(error){checkAbort(signal);if(error?.code!=='MEMORY_LIMIT'||bottom-top===1||rows===1)throw error;const middle=top+Math.floor((bottom-top)/2);await sampleRows(top,middle);await sampleRows(middle,bottom);return;}
      checkAbort(signal);if(row?.data?.length!==span*rows*3)throw new EngineError('INVALID_INPUT','The sampled Original window differs from its declared grid.');
      for(let y=top;y<bottom;y++){await cooperate();const from=(ys[y]-y0)*span*3;for(let x=start;x<end;x++){const a=from+(xs[x]-x0)*3,b=(y*paneWidth+x)*3;rgb[b]=row.data[a];rgb[b+1]=row.data[a+1];rgb[b+2]=row.data[a+2];}}
     }
     for(let top=0;top<outputHeight;){let bottom=top+1;if(batched)while(bottom<outputHeight&&span*(ys[bottom]-ys[top]+1)<=87381)bottom++;await sampleRows(top,bottom);top=bottom;}start=end;
    }
    }
   }
   const frame=await renderEnergy(data,{width:paneWidth,height:outputHeight,...(rgb?{data:rgb}:{})},presentation,{signal,cooperate});const detail={...frame.presentation,preview:true,nativeResolution:false,sourceWidth:width,sourceHeight:height,sampleWidth:outputWidth,sampleHeight:outputHeight,...nativePanels(both,width,height),...(Object.values(observedMaxima??{}).some(Number.isFinite)?{observedMaxima}:{}),...(Object.values(signedRanges??{}).some(r=>Number.isFinite(r?.minimum))?{signedRanges}:{})};if(!Object.values(observedMaxima??{}).some(Number.isFinite)){delete detail.observedMaxima;delete detail.observedMaximum;}else detail.observedMaximum=presentation.field==='unified'||both?Math.max(...Object.values(observedMaxima)):observedMaxima[presentation.field??'high'];if(!Object.values(signedRanges??{}).some(r=>Number.isFinite(r?.minimum))){delete detail.signedRanges;delete detail.signedMinimum;delete detail.signedMaximum;}else if(both){const ranges=Object.values(signedRanges);if(ranges.length===2&&ranges.every(r=>Number.isFinite(r.minimum)&&Number.isFinite(r.maximum))){detail.signedMinimum=Math.min(...ranges.map(r=>r.minimum));detail.signedMaximum=Math.max(...ranges.map(r=>r.maximum));}else{delete detail.signedMinimum;delete detail.signedMaximum;}}return{...frame,logicalWidth,logicalHeight:height,preview:true,presentation:detail,numericSampling};
  }
  const output=new Uint8Array(bytes),columns=Math.min(width,262144),rows=Math.max(1,Math.min(128,Math.floor(262144/columns))),maxima={high:0,low:0},ranges={high:{minimum:Infinity,maximum:-Infinity},low:{minimum:Infinity,maximum:-Infinity}};let detail;
  for(let y=0;y<height;y+=rows)for(let x=0;x<width;x+=columns){await cooperate();checkAbort(signal);const w=Math.min(columns,width-x),h=Math.min(rows,height-y),data={...analysis.data,width:w,height:h};for(const name of names)data[name]=await readEnergyWindow(analysis,name,{x,y,width:w,height:h},{engine,signal});const localSource={width:w,height:h,readPixels:rect=>source.readPixels({...rect,x:rect.x+x,y:rect.y+y})},frame=await renderEnergy(data,localSource,presentation,{signal,cooperate});
   if(w===width)output.set(frame.data,y*outputWidth*3);
   else for(let row=0;row<h;row++)for(let panel=0;panel<panels;panel++){const from=(row*w*panels+panel*w)*3;output.set(frame.data.subarray(from,from+w*3),((y+row)*outputWidth+panel*width+x)*3);}
   detail=frame.presentation;
   for(const key of['high','low']){const m=detail?.observedMaxima?.[key],r=detail?.signedRanges?.[key];if(Number.isFinite(m))maxima[key]=Math.max(maxima[key],m);if(r&&data.energy_scope?.some(value=>value>0)){ranges[key].minimum=Math.min(ranges[key].minimum,r.minimum);ranges[key].maximum=Math.max(ranges[key].maximum,r.maximum);}}
  }
  if(detail){for(const key of['high','low'])if(!Number.isFinite(ranges[key].minimum))ranges[key]={minimum:0,maximum:0};detail={...detail,sourceWidth:width,sourceHeight:height,...nativePanels(both,width,height),observedMaxima:maxima,observedMaximum:presentation.field==='unified'||both?Math.max(maxima.high,maxima.low):maxima[presentation.field??'high'],signedRanges:ranges,...(both?{signedMinimum:Math.min(ranges.high.minimum,ranges.low.minimum),signedMaximum:Math.max(ranges.high.maximum,ranges.low.maximum)}:{})};}
  return{width:outputWidth,height:outputHeight,format:'rgb8',data:output,...(detail?{logicalWidth,logicalHeight:height,presentation:detail}:{})};
 }finally{await engine.releaseExternalMemory(lease.id);}
}
