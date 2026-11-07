import {EngineError,checkAbort,createCooperator} from './unified-engine/src/errors.js';
import {ADAPTIVE_PREVIEW_MAX_SIDE} from './preview-limits.js?v=0.33.1';
import {numericPlaneSamplePlan} from './unified-engine/src/numeric-plane-sampling.js';
const MAX_ELEMENTS=262144;
const type=name=>name==='energy_scope'||name==='energy_labels'||name==='analysis_scope'?Int32Array:Float32Array;
export function energyPlaneCount(analysis){const d=analysis?.data??{},metadata=d.metadata??{},a=d.energyPlaneCount,b=metadata.energy?.planeCount,declared=a??b;if(a!==undefined&&b!==undefined&&a!==b)throw new EngineError('INVALID_INPUT','Energy plane declarations disagree.');const synthesis=metadata.method==='ela_energy_synthesis'||declared===1&&(!!analysis?.synthesis||metadata.energy?.quality_confirmation==='median-already-aggregated');if(synthesis){if(declared!==1)throw new EngineError('INVALID_INPUT','Synthèse Energy requires one declared native plane.');return 1;}if(declared!==undefined&&declared!==3)throw new EngineError('INVALID_INPUT','Normal Energy requires its three native quality planes.');return 3;}
export const energyNativeFieldNames=analysis=>['energy_scope','energy_low_score','energy_high_score',...Array.from({length:energyPlaneCount(analysis)},(_,i)=>'energy_plane_'+i)];
function plane(analysis,name){const d=analysis.data??{},match=/^energy_plane_(\d)$/.exec(name);if(match&&+match[1]>=energyPlaneCount(analysis))return{};const value=match?(Array.isArray(d.energy_planes)?d.energy_planes[+match[1]]:d.energy_planes):d[name];return{value,offset:match&&!Array.isArray(d.energy_planes)&&ArrayBuffer.isView(value)?+match[1]*d.width*d.height:0,surface:analysis.planeSurfaces?.[name]??(name==='energy_low_score'?analysis.surface:null)};}
export function energyFieldAvailable(analysis,name){const f=plane(analysis,name),Type=type(name),n=analysis.data.width*analysis.data.height;return f.value instanceof Type&&f.value.length>=f.offset+n||f.surface?.width===analysis.data.width&&f.surface.height===analysis.data.height;}
/** The caller admits its destination. Engine plane windows stay <=one MiB;
 * samples remain exact native values and never become scientific observations. */
export async function readEnergyWindow(analysis,name,rect,{engine,signal,cooperate}={}){
 checkAbort(signal);const d=analysis.data,{x,y,width,height}=rect,Type=type(name),f=plane(analysis,name);
 if(![x,y,width,height].every(Number.isSafeInteger)||x<0||y<0||width<1||height<1||x+width>d.width||y+height>d.height||width*height>MAX_ELEMENTS)throw new EngineError('INVALID_INPUT','Invalid bounded native energy window.');
 if(f.value instanceof Type){if(f.value.length<f.offset+d.width*d.height)throw new EngineError('INVALID_INPUT','Native energy field dimensions differ.');if(width===d.width)return f.value.subarray(f.offset+y*d.width,f.offset+(y+height)*d.width);const output=new Type(width*height);for(let row=0;row<height;row++){const from=f.offset+(y+row)*d.width+x;output.set(f.value.subarray(from,from+width),row*width);}return output;}
 if(!f.surface)throw new EngineError('DRAFT_BASE_UNAVAILABLE','The retained native energy field is unavailable.');const answer=await engine.readPlane({surfaceId:f.surface.id,revision:f.surface.revision,rect},{signal,...(cooperate?{cooperate}:{})});checkAbort(signal);const p=answer.plane;
 if(!p||p.width!==width||p.height!==height||!(p.data instanceof Type)||p.data.length!==width*height)throw new EngineError('INVALID_INPUT','Retained energy plane changed its native grid or dtype.');return p.data;
}
export async function sampleEnergyField(analysis,name,{width,height,step,centers=false,maxWindowRows=1},{engine,signal,onSampling,workspaceReservationId}={}){
 const d=analysis.data,Type=type(name);if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0&&v<=ADAPTIVE_PREVIEW_MAX_SIDE)||!centers&&(!Number.isSafeInteger(step)||step<1)||!Number.isSafeInteger(maxWindowRows)||maxWindowRows<1)throw new EngineError('INVALID_INPUT','Invalid sampled energy field.');checkAbort(signal);
 const started=performance.now(),native=plane(analysis,name),safeFallback=error=>error&&typeof error==='object'&&Object.isExtensible(error)&&error?.details?.samplePlane?.fallbackSafe===true&&['validation','admission'].includes(error.details.samplePlane.phase)&&['MEMORY_LIMIT','UNSUPPORTED_LAYOUT'].includes(error.code);let decline='unavailable';
 // The direct engine fills exactly the requested coordinates from its store.
 // Optional acceleration never changes the caller's grid or evicts a cache.
 if(!(native.value instanceof Type)&&native.surface&&typeof engine?.samplePlane==='function'&&typeof engine.capabilities==='function'){
  const request={surfaceId:native.surface.id,revision:native.surface.revision,sourceWidth:d.width,sourceHeight:d.height,width,height,centers,...(!centers?{step}:{})};let plan;
  try{plan=numericPlaneSamplePlan(native.surface,request);}catch(error){if(!safeFallback(error))throw error;decline='layout';}
  if(plan){
   const capability=await engine.capabilities(),memory=capability?.memory;checkAbort(signal);
   const prepaid=capability?.sourceAccess?.numericSamplingExternalWorkspace===true&&typeof workspaceReservationId==='string'&&workspaceReservationId.length>0;
   const heap=Number.isFinite(memory?.knownHeapCapacityBytes)?Math.max(32*1024**2,memory.knownHeapCapacityBytes):null;
   if(heap!==null&&Number.isFinite(memory?.policyAvailableBytes)&&memory.policyAvailableBytes>=heap+(prepaid?0:plan.requiredBytes)){
    let answer;try{answer=await engine.samplePlane({...request,...(prepaid?{workspaceReservationId}:{})},{signal});}catch(error){checkAbort(signal);if(!safeFallback(error))throw error;decline=error.details.samplePlane.phase;}
    if(answer){checkAbort(signal);const p=answer.plane,format=Type===Int32Array?'int32':'float32';if(answer.surfaceId!==native.surface.id||answer.revision!==native.surface.revision||p?.width!==width||p.height!==height||p.format!==format||!(p.data instanceof Type)||p.data.length!==width*height)throw new EngineError('INVALID_INPUT','Direct sampled energy plane differs from its admitted source or grid.');onSampling?.({...answer.metrics,method:'direct-numeric-plane',milliseconds:performance.now()-started,width,height});return p.data;}
   }else decline='working-memory';
  }
 }
 const output=new Type(width*height),xs=Array.from({length:width},(_,x)=>centers?Math.min(d.width-1,Math.floor((x+.5)*d.width/width)):x*step),ys=Array.from({length:height},(_,y)=>centers?Math.min(d.height-1,Math.floor((y+.5)*d.height/height)):y*step),cooperate=createCooperator(signal);
 // Batch only the transport windows. Every output point keeps the historical
 // native coordinate, including repeated center samples and sparse wide grids.
 for(let start=0;start<width;){let end=start+1;while(end<width&&xs[end]-xs[start]<MAX_ELEMENTS)end++;const x0=xs[start],span=xs[end-1]-x0+1;
  async function sampleRows(top,bottom){checkAbort(signal);const y0=ys[top];let block;
   try{block=await readEnergyWindow(analysis,name,{x:x0,y:y0,width:span,height:ys[bottom-1]-y0+1},{engine,signal});}
   catch(error){checkAbort(signal);if(error?.code!=='MEMORY_LIMIT'||bottom-top===1||ys[bottom-1]===y0)throw error;const middle=top+Math.floor((bottom-top)/2);await sampleRows(top,middle);checkAbort(signal);await sampleRows(middle,bottom);checkAbort(signal);return;}
   checkAbort(signal);for(let y=top;y<bottom;y++){await cooperate();const from=(ys[y]-y0)*span;for(let x=start;x<end;x++)output[y*width+x]=block[from+xs[x]-x0];}
  }
  // Additional rows are opt-in only after the caller admits their UI scratch.
  // A denied engine window falls back to the historical one-row X segment.
  for(let top=0;top<height;){let bottom=top+1;while(bottom<height&&ys[bottom]-ys[top]+1<=maxWindowRows&&span*(ys[bottom]-ys[top]+1)<=MAX_ELEMENTS)bottom++;await sampleRows(top,bottom);top=bottom;}start=end;
 }
 checkAbort(signal);
 onSampling?.({method:'bounded-plane-windows',decline,milliseconds:performance.now()-started,width,height});
 return output;
}
const histogramViews=new WeakMap();
export function energyHistogramAnalysis(analysis,engine){if(!analysis.planeSurfaces)return analysis;const count=energyPlaneCount(analysis),cached=histogramViews.get(analysis);if(cached?.count===count)return cached.view;const field=name=>({descriptor:analysis.planeSurfaces[name]??(name==='energy_low_score'?analysis.surface:null),width:analysis.data.width,height:analysis.data.height,async readWindow(rect,{signal,cooperate}={}){return{plane:{width:rect.width,height:rect.height,data:await readEnergyWindow(analysis,name,rect,{engine,signal,cooperate})},release(){}};}});const wrapped={...analysis,data:{...analysis.data,...Object.fromEntries(['energy_scope','energy_low_score','energy_high_score'].map(name=>[name,field(name)])),energy_planes:Array.from({length:count},(_,i)=>field('energy_plane_'+i))}};histogramViews.set(analysis,{count,view:wrapped});return wrapped;}
