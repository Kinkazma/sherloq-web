import {allocateTypedArray} from './unified-engine/src/allocation.js';
import {requireValue,checkAbort} from './unified-engine/src/errors.js';

/** Numeric windows use Original coordinates. Independent oriented native maps
 * are copied exactly, never stretched over the envelope; absent map values are
 * NaN and the separate analysis_scope is0/1/2, not a fabricated zero score. */
export async function readCatnetNativeScalar({client,result,source,rect,field='map',expected,signal}){
 checkAbort(signal);
 const domain=result?.sourceRegionDomain,metadata=result?.data?.metadata,descriptor=source?.surface;
 requireValue(result?.operation==='m2.catnet'&&metadata?.fragmented===true&&Array.isArray(metadata.fragments)&&domain&&descriptor&&result.provenance?.originalSourceSha256===source.sha256,'Native CAT-Net scalar source is unavailable or belongs to another Original.');
 requireValue(['map','analysis_scope'].includes(field),'This CAT-Net field is not an Original-coordinate scalar grid.');
 if(expected?.m2Result!==undefined)requireValue(expected.m2Result===result.m2Result.id&&expected.sourceRegionFingerprint===domain.fingerprint,'CAT-Net scalar result/domain changed before its read.');
 const{x,y,width,height}=rect??{},n=width*height;
 requireValue([x,y,width,height].every(Number.isSafeInteger)&&x>=0&&y>=0&&width>0&&height>0&&x+width<=descriptor.width&&y+height<=descriptor.height&&Number.isSafeInteger(n),'CAT-Net scalar window must be inside the Original grid.');
 const output=allocateTypedArray(field==='map'?Float32Array:Uint8Array,n,{label:'Original-coordinate native CAT-Net scalar window'});if(field==='map')output.fill(NaN);
 const limit=Math.max(1,Math.floor((client.ready?.windowBytes??4*1024**2)/(field==='map'?4:1)));
 async function read(offset,count){checkAbort(signal);const values=await client.readArray(result.m2Result.id,field,offset,count);checkAbort(signal);requireValue(values instanceof(field==='map'?Float32Array:Uint8Array)&&values.length===count,'CAT-Net scalar transfer changed its native type or length.');return values;}
 if(field==='analysis_scope'){
  const left=Math.max(x,domain.origin[0]),top=Math.max(y,domain.origin[1]),right=Math.min(x+width,domain.origin[0]+domain.width),bottom=Math.min(y+height,domain.origin[1]+domain.height);
  for(let yy=top;yy<bottom;yy++)for(let xx=left;xx<right;xx+=limit){const count=Math.min(limit,right-xx),values=await read((yy-domain.origin[1])*domain.width+xx-domain.origin[0],count);requireValue(values.every(v=>v===0||v===1||v===2),'Unknown native CAT-Net scientific support.');output.set(values,(yy-y)*width+xx-x);}
 }else{
  for(const fragment of metadata.fragments){
   const b=fragment.bounds;requireValue(Array.isArray(b)&&b.length===4&&b.every(Number.isSafeInteger)&&b[0]>=0&&b[1]>=0&&b[2]<=descriptor.width&&b[3]<=descriptor.height&&b[2]>b[0]&&b[3]>b[1]&&Number.isSafeInteger(fragment.mapOffset)&&fragment.mapOffset>=0,'Invalid Original CAT-Net fragment coordinates.');
   const fw=b[2]-b[0],fh=b[3]-b[1];requireValue(fragment.mapOffset+fw*fh<=result.m2Result.fields.map.length,'CAT-Net fragment exceeds the packed native map.');
   const left=Math.max(x,b[0]),top=Math.max(y,b[1]),right=Math.min(x+width,b[2]),bottom=Math.min(y+height,b[3]);
   for(let yy=top;yy<bottom;yy++)for(let xx=left;xx<right;xx+=limit){const count=Math.min(limit,right-xx),values=await read(fragment.mapOffset+(yy-b[1])*fw+xx-b[0],count);requireValue(values.every(Number.isFinite),'Native CAT-Net map contains a nonfinite modeled observation.');output.set(values,(yy-y)*width+xx-x);}
  }
 }
 checkAbort(signal);return output;
}
