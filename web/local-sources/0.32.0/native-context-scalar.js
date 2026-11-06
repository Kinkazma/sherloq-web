import {requireValue,checkAbort} from './unified-engine/src/errors.js';
import {allocateTypedArray} from './unified-engine/src/allocation.js';

/** These two published contracts certify native context coverage. Other maps,
 * including an arbitrary map containing NaN, are deliberately not admitted. */
export function nativeContextScalarPlan(result,source){
 const domain=result?.sourceRegionDomain,d=source?.surface,sha=result?.provenance?.originalSourceSha256??result?.provenance?.originalSha256;
 const rita=result?.operation==='m2.rita'&&result.data?.metadata?.fragmented===true,trufor=result?.operation==='m2.trufor'&&result.data?.metadata?.fragmented===true,packed=trufor||rita;
 const comprint=result?.operation==='jpeg.comprint'&&result.nativeContexts?.kind==='native-comprint-contexts-global-statistics'&&result.metrics?.sourceRegionPolicy==='native-comprint-contexts-global-statistics';
 requireValue((packed||comprint)&&domain&&d&&sha===source.sha256&&(domain.sourceSha256??domain.snapshot?.sourceSha256)===source.sha256,'A certified native map on the same Original source is required.');
 const fragments=(packed?result.data.metadata.fragments:result.nativeContexts.fragments).map(f=>({index:f.index,bounds:[...(packed?f.bounds:f.originalBounds)],evaluable:f.evaluable,offset:f.offset,nativeShape:[...(packed?f.shape:f.nativeGridShape)]}));
 let selected=0,modeled=0,offset=0;
 for(let index=0;index<fragments.length;index++){
  const f=fragments[index],b=f.bounds;
  requireValue(f.index===index&&b.length===4&&b.every(Number.isSafeInteger)&&b[0]>=0&&b[1]>=0&&b[2]>b[0]&&b[3]>b[1]&&b[2]<=d.width&&b[3]<=d.height&&typeof f.evaluable==='boolean','Native map context bounds changed.');
  const pixels=(b[2]-b[0])*(b[3]-b[1]);selected+=pixels;if(f.evaluable)modeled+=pixels;
  if(packed){requireValue(f.offset===offset,'Packed native TruFor offsets changed.');if(f.evaluable)offset+=pixels;}
 }
 const m=result.metrics;
 requireValue(selected===m.selectedPixels&&modeled===(packed?m.analysedPixels:m.mapEvaluatedPixels)&&selected-modeled===(packed?m.unanalysablePixels:m.nativeUnmappedPixels),'Native map coverage does not match its certified context population.');
 if(packed)requireValue(result.m2Result?.fields?.map?.length===modeled,'Packed native TruFor map length changed.');
 else requireValue(result.surface?.width===domain.width&&result.surface?.height===domain.height&&result.surface.format==='float64','Native Comprint map is not its certified domain grid.');
 return{method:rita?'rita':trufor?'trufor':'comprint',domain,fragments,selected,modeled,nonEvaluable:selected-modeled,sourceSha256:source.sha256,width:d.width,height:d.height,bytes:packed?4:8};
}

/** Original-coordinate numeric projection only. No RGB is read, no score is
 * extrapolated across contexts, and scientific absence is represented by NaN. */
export async function readNativeContextScalar({result,source,rect,field='map',expected,readArray,readPlane,windowBytes=4*1024**2,signal}){
 checkAbort(signal);const plan=nativeContextScalarPlan(result,source),{x,y,width,height}=rect??{},n=width*height;
 requireValue(['map','analysis_scope'].includes(field),'This native field is not an Original-coordinate scalar grid.');
 requireValue([x,y,width,height].every(Number.isSafeInteger)&&x>=0&&y>=0&&width>0&&height>0&&x+width<=plan.width&&y+height<=plan.height&&Number.isSafeInteger(n),'Native scalar window must be inside the Original grid.');
 if(['trufor','rita'].includes(plan.method)&&expected?.m2Result!==undefined)requireValue(expected.m2Result===result.m2Result.id&&expected.sourceRegionFingerprint===plan.domain.fingerprint,'Native scalar result or domain changed.');
 if(plan.method==='comprint'&&expected?.id!==undefined)requireValue(expected.id===result.surface.id&&expected.revision===result.surface.revision,'Native scalar result changed.');
 const Type=field==='analysis_scope'?Uint8Array:plan.bytes===4?Float32Array:Float64Array,output=allocateTypedArray(Type,n,{label:'Original native-context scalar window'});if(field==='map')output.fill(NaN);
 const limit=Math.max(1,Math.floor(windowBytes/plan.bytes));
 for(const f of plan.fragments){
  const b=f.bounds,left=Math.max(x,b[0]),top=Math.max(y,b[1]),right=Math.min(x+width,b[2]),bottom=Math.min(y+height,b[3]),fw=b[2]-b[0];
  for(let yy=top;yy<bottom;yy++)for(let xx=left;xx<right;xx+=limit){
   checkAbort(signal);const count=Math.min(limit,right-xx),at=(yy-y)*width+xx-x;
   if(field==='analysis_scope'){output.fill(f.evaluable?2:1,at,at+count);continue;}
   if(!f.evaluable)continue;
   const values=['trufor','rita'].includes(plan.method)?await readArray(result.m2Result.id,'map',f.offset+(yy-b[1])*fw+xx-b[0],count):await readPlane(result.surface,{x:xx-plan.domain.origin[0],y:yy-plan.domain.origin[1],width:count,height:1});
   checkAbort(signal);requireValue(values instanceof Type&&values.length===count&&values.every(Number.isFinite),'Modeled native map observations must retain their finite native type and length.');output.set(values,at);
  }
 }
 checkAbort(signal);return output;
}
