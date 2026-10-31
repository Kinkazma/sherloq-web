import {renderEnergy} from './energy-render.js?v=0.31.0';
import {readEnergyWindow,sampleEnergyField} from './energy-native-fields.js?v=0.31.0';
import {EngineError,checkAbort} from './unified-engine/src/errors.js';
const fields=view=>view==='scores'?['energy_scope','energy_high_score','energy_low_score']:['energy_labels'];
const nativePanels=(both,width,height)=>both?{panels:['high','low'].map((field,index)=>({field,x:index*width,y:0,width,height}))}:{};
/** Peak live scratch, excluding an RGB result already admitted by the caller.
 * Numeric samples coexist until rendering; native bands do not. JS palette
 * entries use a conservative metadata allowance in addition to typed buffers. */
export function energySurfaceWorkingBytes({width,height,paneWidth,outputHeight,fieldCount,sampled,paletteEntries=0}){
 const paletteBytes=paletteEntries*128+65536;
 if(!sampled)return Math.min(262144,width*Math.min(128,height))*(fieldCount*4+9)+paletteBytes;
 const pixels=paneWidth*outputHeight,span=limit=>{let maximum=0;for(let start=0;start<paneWidth;){const x0=Math.floor((start+.5)*width/paneWidth);let end=start+1;while(end<paneWidth&&Math.floor((end+.5)*width/paneWidth)-x0<limit)end++;maximum=Math.max(maximum,Math.floor((end-.5)*width/paneWidth)-x0+1);start=end;}return maximum;};
 const numericBytes=pixels*fieldCount*4,sourceBytes=pixels*3,numericWindow=span(262144)*4,sourceWindow=span(87381)*3;
 return Math.max(numericBytes+numericWindow,numericBytes+sourceBytes+sourceWindow)+paletteBytes;
}
/** Presentation adapter only: unchanged renderEnergy formulas, exact native
 * bands, one bounded plane window at a time and a separate sampled drag frame. */
export async function renderEnergySurface(analysis,source,presentation={}, {engine,signal,preview,observedMaxima,signedRanges,rgbBudgetReserved=false}={}){
 const {width,height}=analysis.data,both=presentation.view==='scores'&&presentation.field==='both',panels=both?2:1,names=fields(presentation.view),logicalWidth=width*panels;
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||source.width!==width||source.height!==height)throw new EngineError('INVALID_INPUT','Energy presentation source grid differs.');
 const scale=preview?Math.min(1,preview.maxWidth/logicalWidth,preview.maxHeight/height):1,paneWidth=Math.max(1,Math.floor(width*scale)),outputHeight=Math.max(1,Math.floor(height*scale)),outputWidth=paneWidth*panels,sampled=paneWidth!==width||outputHeight!==height,bytes=outputWidth*outputHeight*3;
 const scratch=energySurfaceWorkingBytes({width,height,paneWidth,outputHeight,fieldCount:names.length,sampled,paletteEntries:analysis.data.regionColors?.length??0}),lease=await engine.reserveExternalMemory({bytes:(rgbBudgetReserved?0:bytes)+scratch});
 try{
  if(sampled){const data={...analysis.data,width:paneWidth,height:outputHeight};for(const name of names)data[name]=await sampleEnergyField(analysis,name,{width:paneWidth,height:outputHeight,centers:true},{engine,signal});
   // One bounded sampled source request avoids per-pixel RPCs; choose the same
   // center coordinates as renderEnergy's established drag presentation.
   const rgb=new Uint8Array(paneWidth*outputHeight*3);for(let y=0;y<outputHeight;y++){checkAbort(signal);const sy=Math.min(height-1,Math.floor((y+.5)*height/outputHeight));for(let start=0;start<paneWidth;){let end=start+1,x0=Math.floor((start+.5)*width/paneWidth);while(end<paneWidth&&Math.floor((end+.5)*width/paneWidth)-x0<87381)end++;const x1=Math.floor((end-.5)*width/paneWidth),row=await source.readPixels({x:x0,y:sy,width:x1-x0+1,height:1});for(let x=start;x<end;x++){const at=(Math.floor((x+.5)*width/paneWidth)-x0)*3;rgb.set(row.data.subarray(at,at+3),(y*paneWidth+x)*3);}start=end;}}
   const frame=await renderEnergy(data,{width:paneWidth,height:outputHeight,data:rgb},presentation,{signal});const detail={...frame.presentation,preview:true,nativeResolution:false,sourceWidth:width,sourceHeight:height,sampleWidth:outputWidth,sampleHeight:outputHeight,...nativePanels(both,width,height),...(Object.values(observedMaxima??{}).some(Number.isFinite)?{observedMaxima}:{}),...(Object.values(signedRanges??{}).some(r=>Number.isFinite(r?.minimum))?{signedRanges}:{})};if(!Object.values(observedMaxima??{}).some(Number.isFinite)){delete detail.observedMaxima;delete detail.observedMaximum;}else detail.observedMaximum=presentation.field==='unified'||both?Math.max(...Object.values(observedMaxima)):observedMaxima[presentation.field??'high'];if(!Object.values(signedRanges??{}).some(r=>Number.isFinite(r?.minimum))){delete detail.signedRanges;delete detail.signedMinimum;delete detail.signedMaximum;}else if(both){const ranges=Object.values(signedRanges);if(ranges.length===2&&ranges.every(r=>Number.isFinite(r.minimum)&&Number.isFinite(r.maximum))){detail.signedMinimum=Math.min(...ranges.map(r=>r.minimum));detail.signedMaximum=Math.max(...ranges.map(r=>r.maximum));}else{delete detail.signedMinimum;delete detail.signedMaximum;}}return{...frame,logicalWidth,logicalHeight:height,preview:true,presentation:detail};
  }
  const output=new Uint8Array(bytes),columns=Math.min(width,262144),rows=Math.max(1,Math.min(128,Math.floor(262144/columns))),maxima={high:0,low:0},ranges={high:{minimum:Infinity,maximum:-Infinity},low:{minimum:Infinity,maximum:-Infinity}};let detail;
  for(let y=0;y<height;y+=rows)for(let x=0;x<width;x+=columns){checkAbort(signal);const w=Math.min(columns,width-x),h=Math.min(rows,height-y),data={...analysis.data,width:w,height:h};for(const name of names)data[name]=await readEnergyWindow(analysis,name,{x,y,width:w,height:h},{engine,signal});const localSource={width:w,height:h,readPixels:rect=>source.readPixels({...rect,x:rect.x+x,y:rect.y+y})},frame=await renderEnergy(data,localSource,presentation,{signal});
   if(w===width)output.set(frame.data,y*outputWidth*3);
   else for(let row=0;row<h;row++)for(let panel=0;panel<panels;panel++){const from=(row*w*panels+panel*w)*3;output.set(frame.data.subarray(from,from+w*3),((y+row)*outputWidth+panel*width+x)*3);}
   detail=frame.presentation;
   for(const key of['high','low']){const m=detail?.observedMaxima?.[key],r=detail?.signedRanges?.[key];if(Number.isFinite(m))maxima[key]=Math.max(maxima[key],m);if(r&&data.energy_scope?.some(value=>value>0)){ranges[key].minimum=Math.min(ranges[key].minimum,r.minimum);ranges[key].maximum=Math.max(ranges[key].maximum,r.maximum);}}
  }
  if(detail){for(const key of['high','low'])if(!Number.isFinite(ranges[key].minimum))ranges[key]={minimum:0,maximum:0};detail={...detail,sourceWidth:width,sourceHeight:height,...nativePanels(both,width,height),observedMaxima:maxima,observedMaximum:presentation.field==='unified'||both?Math.max(maxima.high,maxima.low):maxima[presentation.field??'high'],signedRanges:ranges,...(both?{signedMinimum:Math.min(ranges.high.minimum,ranges.low.minimum),signedMaximum:Math.max(ranges.high.maximum,ranges.low.maximum)}:{})};}
  return{width:outputWidth,height:outputHeight,format:'rgb8',data:output,...(detail?{logicalWidth,logicalHeight:height,presentation:detail}:{})};
 }finally{await engine.releaseExternalMemory(lease.id);}
}
