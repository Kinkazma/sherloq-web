import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from './source-region-geometry.js';
import {prepareNeuralStrictSourceContext} from './neural-strict-source-context.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {requireValue,checkAbort} from './errors.js';
/** Preserve the ordinary M3 pixel-only API as well as retained row surfaces.
 * The array is never painted or copied wholesale. Strict consumers request
 * only admitted windows through the same Original surface contract. */
export function sparseStrictImageRecord(record,budget){
 const surface=r=>{if(r?.surface)return{...r};const p=r?.pixels;requireValue(p?.format==='rgb8'&&p.data instanceof Uint8Array&&Number.isSafeInteger(p.width)&&Number.isSafeInteger(p.height)&&p.data.length===p.width*p.height*3,'Strict sparse source requires native RGB pixels or a retained RGB surface.');return{...r,surface:{descriptor:{format:'rgb8',width:p.width,height:p.height},async readWindow(rect,{signal}={}){checkAbort(signal);requireValue([rect.x,rect.y,rect.width,rect.height].every(Number.isSafeInteger)&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=p.width&&rect.y+rect.height<=p.height,'Sparse RGB window lies outside its native source.');const free=budget.reserve(rect.width*rect.height*3);let complete=false;try{const data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++)data.set(p.data.subarray(((rect.y+y)*p.width+rect.x)*3,((rect.y+y)*p.width+rect.x+rect.width)*3),y*rect.width*3);checkAbort(signal);complete=true;let released=false;return{pixels:{format:'rgb8',width:rect.width,height:rect.height,data},release(){if(!released){released=true;free();}}};}finally{if(!complete)free();}}}};};
 const normalized=surface(record);if(record.originalSource)normalized.originalSource=surface(record.originalSource);return normalized;
}
/** Geometry/provenance preparation only. No RGB is read by this compiler.
 * The shared strict-context compiler distinguishes real negatives from the
 * certified acquisition complement before an extractor can borrow pixels. */
export async function prepareSparseStrictNativeContext(record,task,{budget,signal}={}){
 record=sparseStrictImageRecord(record,budget);
 requireValue(record?.surface?.descriptor&&record.sha256&&budget?.reserve&&task?.operation==='tampering.copyMove.sparse','Strict sparse source preparation needs its actual image owner and task.');
 checkAbort(signal);const metadata=budget.reserve(65536+sourceRegionTransportBytes([record.sourceRegionDomain??null,task],{allowAliases:true,allowUndefined:true})*4);let prepared,complete=false;
 try{
  const source=record.originalSource??record,d=source.surface?.descriptor,local=record.surface.descriptor;requireValue(d&&d.format==='rgb8'&&record.surface.descriptor.format==='rgb8'&&source.sha256===record.sha256,'Strict sparse source grid or owner identity changed.');
  const domain=record.sourceRegionDomain?await compileOriginalSourceRegions(record.sourceRegionDomain):await compileOriginalSourceRegions((await createOriginalSourceRegionsState({sourceSha256:record.sha256,width:d.width,height:d.height})).snapshot());
  requireValue(domain.sourceSha256===record.sha256&&domain.sourceWidth===d.width&&domain.sourceHeight===d.height&&domain.width===local.width&&domain.height===local.height,'Strict sparse record does not use its verified Original crop.');
  prepared=await prepareNeuralStrictSourceContext({domain,task},{budget,signal});checkAbort(signal);let closed=false;complete=true;
  return{source:{...source.surface,sha256:source.sha256},sourceDomain:domain,candidateDomain:prepared.candidateDomain,contextDomain:prepared.contextDomain,origin:[...domain.origin],width:domain.width,height:domain.height,fingerprint:prepared.fingerprint,strictExclusions:prepared.strictExclusions,originalTask:prepared.originalTask,contextRequired:prepared.contextRequired,release(){if(closed)return;closed=true;prepared.release();metadata();}};
 }finally{if(!complete){prepared?.release();metadata();}}
}
