import "../../runtime-context.js?v=0.25.0";
import {allocateOwnedTypedArray} from './allocation.js';
import {createSsgEdges,ssgEdgesMemoryPlan} from './ssg-edges.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

/** Sparse scalar fields are not an RGB mosaic. Only the certified, normalized
 * contexts are ever given to VLFeat/the real forest. Unknown scalar slots stay
 * NaN with validity zero and never enter a Gaussian or SSIM reduction. */
export async function createSsgStrictFields(source,{budget,profile,model,withEdges=true,signal,onProgress,edgesFactory=()=>createSsgEdges({budget,profile})}={}){
 requireValue(source?.contexts&&budget,'Strict SSG field ownership requires a source and budget.');
 if(withEdges)requireValue(model?.url&&model.bytes&&model.sha256,'The pinned native SSG forest resource is required.');
 const owners=[],own=(Type,length,label)=>{const value=allocateOwnedTypedArray(Type,length,{budget,owner:'ssg-strict-fields',label});owners.push(value);return value.data;};let detector,prepared,edge,returned=false,primary,failed=false,metadataRelease;
 try{
  const n=source.width*source.height,gray=own(Float64Array,n,'observed global grayscale'),known=own(Uint8Array,n,'admitted analysis centers'),edges=own(Float32Array,n,'native structured edges'),edgeKnown=own(Uint8Array,n,'native structured-edge support');gray.fill(NaN);edges.fill(NaN);metadataRelease=budget.reserve(65536+source.contexts.length*4096);const records=[];
  // Largest forest first keeps one native model/arena reusable for all smaller
  // contexts; output records and common coordinates retain their source order.
  const ordered=[...source.contexts].sort((a,b)=>(b.width+35)*(b.height+35)-(a.width+35)*(a.height+35)||a.index-b.index);if(withEdges)detector=edgesFactory();let admitted=0,edgePixels=0;
  for(const context of ordered){
   await controlCheckpoint(signal);prepared=await source.read(context,{signal});const evaluable=context.width>=16&&context.height>=16;
   for(let y=0;y<context.height;y++){const at=(context.y+y)*source.width+context.x;gray.set(prepared.gray.subarray(y*context.width,(y+1)*context.width),at);known.fill(1,at,at+context.width);}admitted+=context.width*context.height;
   const record={index:context.index,bounds:[...context.bounds],normalization:structuredClone(prepared.metadata),forestStatus:withEdges?(evaluable?'native':'native-not-evaluable'):'not-requested',forestMinimum:[16,16],nativePixels:0};
   if(withEdges&&evaluable){ssgEdgesMemoryPlan(context.width,context.height);edge=await detector.run({rgb:prepared.rgb,width:context.width,height:context.height,model},{signal});requireValue(edge.edgeMap instanceof Float32Array&&edge.edgeMap.length===context.width*context.height,'Native SSG forest shape changed.');for(let y=0;y<context.height;y++){const at=(context.y+y)*source.width+context.x;edges.set(edge.edgeMap.subarray(y*context.width,(y+1)*context.width),at);edgeKnown.fill(1,at,at+context.width);}record.nativePixels=context.width*context.height;record.nativeMetadata=structuredClone(edge.metadata);edgePixels+=record.nativePixels;await edge.release();edge=null;}
   records.push(record);await prepared.release();prepared=null;onProgress?.({phase:'ssg-structured-edges',completed:records.length,total:ordered.length});
  }
  checkAbort(signal);records.sort((a,b)=>a.index-b.index);returned=true;let released=false;return{gray,known,edgeMap:edges,edgeKnown,width:source.width,height:source.height,originalWidth:source.sourceWidth,originalHeight:source.sourceHeight,scaleX:source.scaleX,scaleY:source.scaleY,origin:[...source.origin],metadata:{admittedPixels:admitted,boundingPixels:n,edgePixels,contexts:records,forestModelSha256:withEdges?model.sha256:null,scalarUnknownPolicy:'NaN plus explicit validity; not RGB observations'},release(){if(released)return;released=true;for(const owner of owners)owner.release();metadataRelease();}};
 }catch(error){failed=true;primary=error;throw error;}finally{
  const errors=[];for(const action of[()=>edge?.release(),()=>prepared?.release(),()=>detector?.dispose()])try{await action();}catch(error){errors.push(error);}if(!returned||errors.length){for(const owner of owners)owner.release();metadataRelease?.();}if(errors.length){if(failed){if(primary&&typeof primary==='object'&&Object.isExtensible(primary))primary.ssgFieldCleanupErrors=errors;}else throw new AggregateError(errors,'Strict SSG native-field retirement failed.');}
 }
}
