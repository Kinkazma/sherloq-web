import "../../runtime-context.js?v=0.24.0";
import {sourceRegionAdjust} from './source-region-adjust.js';
import {sourceRegionPlots} from './source-region-plots.js';
import {sourceRegionEla} from './source-region-ela.js';
import {validateParams as validateElaParams} from './ela.js';
import {EngineError,checkAbort,normalizeResourceError} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {PIXEL_OPERATIONS} from './pixel-operations.js';

// Exclusions are never observations. Outside the membership the returned RGB
// surface keeps the original solely as a presentation background. Only native
// admitted rectangles are passed to the pixel-independent scientific kernel.
export async function sourceRegionPointwise({task,original,derived,view,domain,budget,signal,onProgress,publishResult}){
 const operation=PIXEL_OPERATIONS[task.operation],params=operation.validate(task.params);
 const adapter=SOURCE_REGION_SPATIAL_ADAPTERS[task.operation];
 if(!adapter?.accepts(params)||task.operation==='inspection.adjust'&&(params.equalize!==0||params.threshold===0))throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','These parameters require a separate membership-aware neighborhood or statistics adapter.');
 const width=domain.width,height=domain.height,bytes=width*height*3;let output,surface,published=false,blocks=0;
 try{
  output=await createSegmentedBytes(bytes,{budget,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,signal});
  // This copy is explicitly display-only and is not passed to any analysis.
  const rows=Math.max(1,Math.min(height,Math.floor(262144/width)));
  for(let y=0;y<height;y+=rows){checkAbort(signal);const h=Math.min(rows,height-y),window=await original.surface.readWindow({x:domain.origin[0],y:domain.origin[1]+y,width,height:h},{signal});try{await output.write(window.pixels.data,y*width*3);}finally{window.release();}}
  const heap=operation.extraBytes??0,factor=Math.max(2,operation.scratchFactor??2),available=budget.limit-budget.retained-budget.active-heap;
  const pixels=Math.min(262144,Math.floor(available/(factor*3)),1024*1024);
  if(pixels<1)throw new EngineError('MEMORY_LIMIT','The membership-aware native kernel cannot fit the current budget.');
  let completed=0,semantics;
  await view.visitIncluded(async(pixels,{rect})=>{
   checkAbort(signal);const release=budget.reserve(heap+pixels.data.length*factor);
   try{const result=await operation.compute(pixels,params,{signal});checkAbort(signal);
    if(result.pixels?.format!=='rgb8'||result.pixels.width!==rect.width||result.pixels.height!==rect.height||result.pixels.data.length!==rect.width*rect.height*3)throw new EngineError('INVALID_RESULT','Pointwise kernel returned another native pixel grid.');
    for(let row=0;row<rect.height;row++)await output.write(result.pixels.data.subarray(row*rect.width*3,(row+1)*rect.width*3),((rect.y+row)*width+rect.x)*3);
    semantics=result.semantics;blocks++;completed+=rect.width*rect.height;onProgress?.({phase:'source-region-pointwise',fraction:completed/domain.countIncluded});
   }finally{release();}
  },{signal,windowPixels:pixels});
  await output.flush();checkAbort(signal);surface=createRgbSurface(output,{width,height,budget});
  const record={surface,semantics:(semantics??'Native pointwise visualization.')+' Only admitted original pixels were computed; excluded pixels retain the original for display only.',metrics:{blocks,includedPixels:domain.countIncluded,excludedPixels:width*height-domain.countIncluded,storage:output.storage,sourceRegionPolicy:'point-independent-admitted-native-rectangles'}};
  const bundle=publishResult(task.imageId,record);published=true;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,semantics:record.semantics,metrics:record.metrics,provenance:{params,sourceRegionDomain:domain.descriptor,excludedParticipation:'omitted',presentationOutsideDomain:'original-unanalysed'}};
 }catch(error){if(!published){if(surface)await surface.dispose();else await output?.dispose();}throw normalizeResourceError(error);}
}
const all=()=>true;
export const SOURCE_REGION_SPATIAL_ADAPTERS=Object.freeze({
 'ela.classic':{shapes:['membership'],validateParams:validateElaParams,accepts:all,parameterConstraints:'Only MCU cores with complete admitted native support are analysed; analysis_scope reports the analysed subset.',run:sourceRegionEla},
 'colors.plots':{shapes:['membership'],validateParams:PIXEL_OPERATIONS['colors.plots'].validate,accepts:all,parameterConstraints:'Native pyrDown omits samples whose complete support touches excluded observations; native RGB/HSV row order retained.',run:sourceRegionPlots},
 'colors.stats':{shapes:['membership'],validateParams:PIXEL_OPERATIONS['colors.stats'].validate,accepts:all,parameterConstraints:'All native channel-rank parameters; pixels independent.',run:sourceRegionPointwise},
 'colors.space':{shapes:['membership'],validateParams:PIXEL_OPERATIONS['colors.space'].validate,accepts:all,parameterConstraints:'All native color-space parameters; no spatial or global reductions.',run:sourceRegionPointwise},
 'inspection.adjust':{shapes:['membership'],validateParams:PIXEL_OPERATIONS['inspection.adjust'].validate,accepts:p=>p.equalize<=1&&p.sharpen===0,parameterConstraints:'Membership path: native pointwise adjustments, global equalization and Otsu; no sharpening or local CLAHE.',run:sourceRegionAdjust}
});
