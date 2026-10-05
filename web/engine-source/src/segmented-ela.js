import {createRgbRecompression,rgbRecompressionPlan} from './jpeg-rgb-stream.js';import {createSegmentedBytes} from './segmented-bytes.js';import {createRgbSurface} from './rgb-surface.js';import {toneTable,fusedCpu} from './ela-lut.js';import {checkAbort} from './errors.js';
export async function segmentedEla(image,params,{budget,signal,onProgress,table,saveTable}={}){
 const descriptor=image.surface.descriptor,plan=rgbRecompressionPlan(image.surface);let output,surface,planning,tableRelease;
 try{
  // Reserve future codec/window space before choosing output storage.
  planning=budget.reserve(plan.workingBytes+plan.windowAllowance+1024**2);output=await createSegmentedBytes(descriptor.width*descriptor.height*3,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});planning();planning=null;
  tableRelease=budget.reserve(1024**2);const tableCached=!!table;if(!table){table=await toneTable(params,{signal});saveTable?.(table);}image.rgbRecompression??=createRgbRecompression(image,budget);
  const metrics=await image.rgbRecompression.visit(params.quality,{signal,onProgress,onBand:async(original,recompressed,{y})=>{const release=budget.reserve(original.byteLength);try{const rendered=await fusedCpu(original,recompressed,params,table,{signal});await output.write(rendered,y*descriptor.width*3);}finally{release();}}});await output.flush();checkAbort(signal);output.markCold();
  surface=createRgbSurface(output,{width:descriptor.width,height:descriptor.height,budget});return {surface,semantics:'Full-resolution global JPEG residual visualization; not a detection or authenticity verdict.',metrics:{...metrics,storage:output.storage,tableCached,retainedResultBytes:output.byteLength}};
 }catch(error){await output?.dispose();throw error;}finally{planning?.();tableRelease?.();}
}
