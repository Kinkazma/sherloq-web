import {combineSparseWindowPresentation} from './sparse-window-presentation.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

/** Translate complete native tables/masks only. Native SSG banks and scalar
 * localization stay separate per job; an OR here is presentation, not matching. */
export async function combineSsgWindowPresentation(answer,{budget,signal,presentationOrigin=[0,0],width,height,sourceSha256,params={},preview,globalFrame}={}){
 requireValue([width,height].every(n=>Number.isSafeInteger(n)&&n>0),'SSG presentation needs its actual parent grid.');checkAbort(signal);
 if(preview){
  const input=answer.mode==='global'?(answer.globalResult?[{id:'global-analysis',kind:'region',origin:globalFrame.origin,status:'complete',output:answer.globalResult}]:answer.windowResults):answer.windowResults,windows=[];
  for(const entry of input){if(entry.status==='empty'){windows.push({id:entry.id,kind:entry.kind,origin:[...entry.origin],status:'empty',draft:null});continue;}
   const raw=entry.output;requireValue(raw?.exact===false&&raw.provisional===true&&raw.exportable===false&&raw.mask instanceof Uint8Array&&raw.provenance?.sourceSha256===sourceSha256,'A complete native SSG provisional draft is required.');
   const {release,...draft}=raw;windows.push({id:entry.id,kind:entry.kind,origin:entry.origin.map((v,i)=>v-presentationOrigin[i]),status:'complete',draft});
  }
  const free=budget.reserve(65536+sourceRegionTransportBytes([params,windows.map(({draft,...w})=>({...w,provenance:draft?.provenance??null}))],{allowAliases:true,allowUndefined:true})*4);let released=false;
  return{data:{schema:'sherloq.ssg-window-draft/1',cloneWindowMode:answer.mode,windows,originalWidth:width,originalHeight:height,params:structuredClone(params),exact:false,provisional:true,exportable:false,provenance:{sourceSha256,approximation:'Each unchanged native SSIM/ROI provisional grid is mapped separately into its parent presentation; no cross-window morphology.'},metadata:{algorithm:'SSG',cloneWindowMode:answer.mode,cloneAnalysisWindows:{mode:answer.mode,fingerprint:answer.fingerprint,matchingAcrossWindows:answer.mode==='global'}}},release(){if(!released){released=true;free();}}};
 }
 const presentation=await combineSparseWindowPresentation(answer,{budget,signal,presentationOrigin,params});let credit,complete=false;
 try{
  if(!answer.windowResults.some(w=>w.status==='complete')){complete=true;return presentation;}
  credit=budget.reserve(width*height*2+65536);const mask=new Uint8Array(width*height),directSsimSupport=new Uint8Array(width*height),stages=[];let modelSha256;
  for(const entry of answer.windowResults){
   if(entry.status==='empty')continue;const raw=entry.output;
   requireValue(raw.params?.algorithm==='SSG'&&raw.mask instanceof Uint8Array&&raw.directSsimSupport instanceof Uint8Array&&[raw.width,raw.height].every(n=>Number.isSafeInteger(n)&&n>0)&&raw.mask.length===raw.width*raw.height&&raw.directSsimSupport.length===raw.mask.length,'Complete native SSG masks are required; sparse points cannot substitute.');
   const [dx,dy]=entry.origin.map((v,i)=>v-presentationOrigin[i]);requireValue(Number.isSafeInteger(dx)&&Number.isSafeInteger(dy)&&dx>=0&&dy>=0&&dx+raw.width<=width&&dy+raw.height<=height,'Native SSG mask escapes the parent Original frame.');
   if(modelSha256!==undefined)requireValue(raw.metadata.modelSha256===modelSha256,'Different native SSG forest models cannot share a presentation.');modelSha256=raw.metadata.modelSha256;
   for(let y=0;y<raw.height;y++){for(let x=0;x<raw.width;x++){const at=y*raw.width+x,out=(y+dy)*width+x+dx;requireValue(raw.mask[at]<=1&&raw.directSsimSupport[at]<=1,'Invalid native SSG mask value.');mask[out]|=raw.mask[at];directSsimSupport[out]|=raw.directSsimSupport[at];}if(y%32===0)await controlCheckpoint(signal);}
   stages.push({id:entry.id,...raw.metadata.stageCache});
  }
  Object.assign(presentation.data,{mask,directSsimSupport,width,height});Object.assign(presentation.data.metadata,{algorithm:'SSG',modelSha256,ssgWindowStages:stages,ssgMaskPresentation:{coordinates:'parent-native-pixel-centres',origin:[...presentationOrigin],nativeMasks:'Complete masks retained separately in each dataNatif; the parent mask is their translated presentation union.'}});
  const old=presentation.release;let released=false;presentation.release=()=>{if(released)return;old();credit();released=true;};checkAbort(signal);complete=true;return presentation;
 }finally{if(!complete){presentation.release();credit?.();}}
}
