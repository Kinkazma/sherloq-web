import {createPDFImageDomainPage} from './pdf-subimages.js';
import {createPDFSubimageMemory} from './pdf-subimage-memory.js';
import {createPDFScopeClient} from './pdf-layout.js';
import {obsoletePDFScope} from './pdf-scope-version.js';

// Opening an extracted figure must retain its native panel domains, including
// when it is reopened from the collection in a different renderer tab.
export function createPDFImageContext(memory,{changed=()=>{},onError=()=>{},beforePublish,scopeFactory=createPDFScopeClient,memoryFactory=createPDFSubimageMemory,saveScope=async(id,scope)=>{const {updateJob}=await import('./db.js');return updateJob(id,job=>job?{...job,pdfSubimageScope:scope}:undefined);}}={}){
 let current=null;
 const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
 const valid=(scope,job)=>scope?.schema==='sherloq.pdf-subimages/1'&&scope.width===job.width&&scope.height===job.height&&digest(scope.sourceSha256)&&(!digest(job.sha256)||scope.sourceSha256.toLowerCase()===job.sha256.toLowerCase())&&Array.isArray(scope.subimages)&&scope.subimages.length>0&&scope.subimages.every(rect=>rect&&[rect.x0,rect.y0,rect.x1,rect.y1].every(Number.isSafeInteger)&&rect.x0>=0&&rect.y0>=0&&rect.x1>rect.x0&&rect.y1>rect.y0&&rect.x1<=job.width&&rect.y1<=job.height);
 function clear(){const previous=current;current=null;if(previous?.owned){previous.closed=true;previous.client?.dispose();previous.subimages.dispose();}}
 return {
  select(job,session){
   if(current?.image.job.id===job.id)return;
   clear();
   const image=[...(session?.images.values()??[])].find(value=>value.job.id===job.id);
   if(image){current={image,subimages:session.subimages,owned:false};return;}
   if(!job.sourcePDFId||job.reason==='pdf-rendered-page')return;
   const context={image:{job,scope:valid(job.pdfSubimageScope,job)&&!obsoletePDFScope(job.pdfSubimageScope)?job.pdfSubimageScope:null,entry:null},subimages:memoryFactory(memory,{changed,beforePublish}),owned:true,closed:false};current=context;
   if(context.image.scope)return;
   void (async()=>{context.client=scopeFactory();return context.client.prepare({id:job.id,blob:job.blob,width:job.width,height:job.height,encoding:job.reason});})().then(async scope=>{
    if(context.closed)return;
    if(!valid(scope,job))throw Error('Invalid PDF image sub-image domains.');
    context.image.scope=scope;
    // A scope arriving after a selection change cannot redraw the new source.
    await saveScope(job.id,scope);
    if(!context.closed&&current===context)changed();
   }).catch(error=>{if(!context.closed&&error.code!=='CANCELLED')onError(error);});
  },
  page(entry){return current&&entry?.id===current.image.job.id?createPDFImageDomainPage(current.image,entry):null;},
  get memory(){return current?.subimages;},
  stats(){return current?{id:current.image.job.id,pending:!current.image.scope,domains:current.image.scope?.subimages??null,sourceSha256:current.image.scope?.sourceSha256,...current.subimages.stats()}:null;},
  invalidate(){if(current?.owned)current.subimages.invalidate();},
  dispose:clear
 };
}
