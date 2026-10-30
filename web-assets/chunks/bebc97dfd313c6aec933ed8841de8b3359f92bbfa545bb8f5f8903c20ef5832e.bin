import "../../runtime-context.js?v=0.30.0";
import {efficientLoFtrParams,efficientLoFtrCrop,efficientLoFtrShape,prepareEfficientLoFtr,mapEfficientLoFtrPoint} from './efficient-loftr-input.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

const inside=(image,poly)=>{const xs=poly.map(v=>v[0]),ys=poly.map(v=>v[1]);return Math.min(image.width,Math.ceil(Math.max(...xs))+1)>Math.max(0,Math.floor(Math.min(...xs)))&&Math.min(image.height,Math.ceil(Math.max(...ys))+1)>Math.max(0,Math.floor(Math.min(...ys)));};
const localPolygon=(w,h)=>[[0,0],[w-1,0],[w-1,h-1],[0,h-1]];

/** Geometry and exact native input only. The supplied view is already ONE
 * independent analysis or the explicit canonical union. Scientific ROI pairs
 * do not become orchestration windows. No model/session/matcher is created.
 */
export async function planEfficientLoFtrLiteralContexts(view,input,{budget,signal}={}){
 requireValue(view?.domain&&typeof view.admittedRectangles==='function'&&typeof view.readWindow==='function'&&typeof budget?.reserve==='function','A verified admitted RGB view and memory budget are required.');checkAbort(signal);
 const params=efficientLoFtrParams(input),image=view.descriptor,releases=[];let returned=false;
 try{
  const banks=[];
  for(let side=0;side<2;side++){
   const polygon=params.regions[side];
   if(!inside(image,polygon)){banks.push({side,polygon,nativeRoiCrop:null,status:'outside-window',contexts:[],pixels:0,coarseCells:0,aggregateTokens:0});continue;}
   const nativeRoiCrop=efficientLoFtrCrop(image,polygon,params.longSide),rect={x:nativeRoiCrop.x,y:nativeRoiCrop.y,width:nativeRoiCrop.width,height:nativeRoiCrop.height},contexts=[];
   // This existing iterator merges equal adjacent admitted spans. It sees the
   // canonical union rather than IDs, overlap multiplicity or RGB chunk size.
   for(const r of view.admittedRectangles(rect)){
    checkAbort(signal);releases.push(budget.reserve(1024));
    const nativeCrop=efficientLoFtrCrop({width:r.width,height:r.height},localPolygon(r.width,r.height),params.longSide),originOriginal=[r.x+view.domain.origin[0],r.y+view.domain.origin[1]];
    contexts.push({side,sourceDomainFingerprint:view.domain.fingerprint,sourceRect:{...r},originOriginal,boundsOriginal:[...originOriginal,originOriginal[0]+r.width,originOriginal[1]+r.height],nativeCrop,mappingCropOriginal:{...nativeCrop,x:originOriginal[0],y:originOriginal[1]},coarse:{width:nativeCrop.widthPadded/8,height:nativeCrop.heightPadded/8},aggregate:{width:nativeCrop.widthPadded/32,height:nativeCrop.heightPadded/32},fine:{width:nativeCrop.widthPadded,height:nativeCrop.heightPadded}});
    if(contexts.length%64===0)await controlCheckpoint(signal);
   }
   contexts.sort((a,b)=>a.sourceRect.y-b.sourceRect.y||a.sourceRect.x-b.sourceRect.x||a.sourceRect.height-b.sourceRect.height||a.sourceRect.width-b.sourceRect.width);
   let coarseOffset=0,aggregateOffset=0;
   for(let index=0;index<contexts.length;index++){
    const c=contexts[index],r=c.sourceRect;c.index=index;c.id=JSON.stringify([side,r.x,r.y,r.width,r.height]);c.coarseOffset=coarseOffset;c.aggregateOffset=aggregateOffset;coarseOffset+=c.coarse.width*c.coarse.height;aggregateOffset+=c.aggregate.width*c.aggregate.height;
   }
   banks.push({side,polygon,nativeRoiCrop,status:contexts.length?'ready':'excluded',contexts,pixels:contexts.reduce((n,c)=>n+c.sourceRect.width*c.sourceRect.height,0),coarseCells:coarseOffset,aggregateTokens:aggregateOffset});
  }
  const crops=banks.map(b=>b.nativeRoiCrop);
  if(crops.every(Boolean))requireValue(crops[0].x!==crops[1].x||crops[0].y!==crops[1].y||crops[0].width!==crops[1].width||crops[0].height!==crops[1].height,'EfficientLoFTR requires two distinct native comparison crops.');
  const ready=banks.every(b=>b.status==='ready');let released=false;returned=true;
  return{schema:'sherloq.efficient-loftr-literal-context-plan/3',status:ready?'ready':'comparison-empty',sourceDomainFingerprint:view.domain.fingerprint,params,banks,contextPolicy:'canonical-disjoint-admitted-rectangles-native-local-grids',rgbPolicy:'literal native ROI bounding crops intersected with admitted context; polygon/excluded native postfilters retained',populationPolicy:'all native padded coarse cells and aggregate tokens kept before common attention/dual-softmax; native local border2 applied later',qualified:false,release(){if(!released){released=true;for(const release of releases)release();}}};
 }finally{if(!returned)for(const release of releases)release();}
}

export async function prepareEfficientLoFtrLiteralContext(view,context,{budget,signal}={}){
 requireValue(typeof budget?.reserve==='function'&&context?.sourceRect&&context.sourceDomainFingerprint===view?.domain?.fingerprint&&typeof view?.includesRectangle==='function'&&view.includesRectangle(context.sourceRect),'A complete literal admitted native context on the same source domain is required.');checkAbort(signal);
 const r=context.sourceRect,image={format:'rgb8',width:r.width,height:r.height,readWindow(rect,hooks){return view.readWindow({...rect,x:rect.x+r.x,y:rect.y+r.y},hooks);}};
 return prepareEfficientLoFtr(image,context.nativeCrop,{signal,reserveMemory:n=>budget.reserve(n)});
}

export function efficientLoFtrLiteralContextShape(context,variant={rotation:0,reflected:false}){
 return efficientLoFtrShape(context.nativeCrop,variant.rotation);
}
export function mapEfficientLoFtrLiteralContextPoint(x,y,context,variant={rotation:0,reflected:false}){
 // Feed the native mapper an Original crop origin. Adding that origin after
 // native mapping would reorder binary64 additions around its half-pixel.
 return mapEfficientLoFtrPoint(x,y,context.mappingCropOriginal,variant);
}
