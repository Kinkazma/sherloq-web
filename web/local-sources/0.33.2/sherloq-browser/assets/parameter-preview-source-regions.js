import {compileOriginalSourceRegions} from './unified-engine/src/source-region-geometry.js';
import {planParameterRegionSamples,parameterRegionMembership,parameterRegionDerivedDomain} from './unified-engine/src/source-region-preview-grid.js';
export {planParameterRegionSamples,parameterRegionMembership,parameterRegionDerivedDomain};
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const check=signal=>{if(signal?.aborted)throw signal.reason??Object.assign(Error('Scoped parameter sampling cancelled.'),{code:'CANCELLED'});};
/** The caller retains this admission through encoding/transfer, including ACK. */
export async function readParameterRegionSamples({engine,source,domain:input,maxSide=192,signal,onOwner=()=>{},onRetired=()=>{}}={}){
 check(signal);const domain=await compileOriginalSourceRegions(input);check(signal);const d=source?.surface;if(!d||source.sha256!==domain.sourceSha256||d.width!==domain.sourceWidth||d.height!==domain.sourceHeight)fail('SOURCE_REGIONS_INVALID','Preview membership belongs to another Original source.');
 const plan=planParameterRegionSamples(domain,maxSide),held=await engine.reserveExternalMemory({bytes:plan.bufferBytes+plan.metadataBytes+plan.width*3,label:'strict-parameter-preview-samples'});let published=false,releasing,released=false,failed=false;
 const release=()=>{if(released)return Promise.resolve();if(releasing)return releasing;return releasing=Promise.resolve().then(()=>engine.releaseExternalMemory(held.id)).then(()=>{released=true;onRetired(owner);},error=>{releasing=null;throw error;});};
 const owner={release};
 try{
  onOwner(owner);check(signal);const membership=parameterRegionMembership(domain,plan),data=new Uint8Array(plan.pixels*3);let reads=0,readPixels=0;
  for(let row=0;row<plan.height;row++)for(const[a,b]of domain.rowIntervals(row*plan.step)){
   check(signal);const x0=Math.max(0,Math.ceil(a/plan.step)),x1=Math.min(plan.width,Math.ceil(b/plan.step));if(x1<=x0)continue;
   // Each read stays inside ONE admitted native interval. A smaller-than-step
   // true hole must not be read merely because no sampled centre lands in it.
   const tile={x:domain.origin[0]+x0*plan.step,y:domain.origin[1]+row*plan.step,w:(x1-x0-1)*plan.step+1,h:1,step:plan.step},answer=await engine.readDisplay({surfaceId:d.id,revision:d.revision,tile});check(signal);const p=answer?.pixels;
   if(p?.format!=='rgb8'||p.width!==x1-x0||p.height!==1||!(p.data instanceof Uint8Array)||p.data.length!==p.width*3)fail('INVALID_INPUT','Scoped preview source returned another sampled grid.');data.set(p.data,(row*plan.width+x0)*3);reads++;readPixels+=p.width;
  }
  check(signal);published=true;return{pixels:{width:plan.width,height:plan.height,format:'rgb8',data},logicalWidth:domain.width,logicalHeight:domain.height,sourceIdentity:[source.sha256??source.id,domain.fingerprint],sourceRegionSamples:{...plan,membership:membership.mask,rectangles:membership.rectangles,included:membership.included,sourceReads:reads,readPixels},release};
 }catch(error){failed=true;throw error;}finally{if(!published)try{await release();}catch(error){if(!failed)throw error;}}
}
/** Parent-owned loans keep failed admission ACKs reachable until close retries. */
export function createParameterRegionSampler({engine,source,domain}={}){
 const owners=new Set(),active=new Set(),controller=new AbortController();let closing=false,closed=false,retirement;
 return{sourceRegionDomain:domain,read(options={}){if(closing)return Promise.reject(Object.assign(Error('Scoped preview reader closed.'),{code:'CANCELLED'}));const signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal,task=readParameterRegionSamples({engine,source,domain,...options,signal,onOwner:owner=>owners.add(owner),onRetired:owner=>owners.delete(owner)});active.add(task);task.then(()=>active.delete(task),()=>active.delete(task));return task;},
  dispose(){if(closed)return Promise.resolve();if(retirement)return retirement;closing=true;controller.abort(Object.assign(Error('Scoped preview reader closed.'),{code:'CANCELLED'}));retirement=(async()=>{await Promise.allSettled([...active]);const failures=[];for(const owner of [...owners])try{await owner.release();}catch(error){failures.push(error);}if(failures.length)throw failures[0];closed=true;})();retirement.then(()=>{},()=>{retirement=null;});return retirement;},
  get state(){return{closing,closed,owners:owners.size,active:active.size};}};
}
/** Presentation coordinates only; science already ran through strict adapters. */
export function frameParameterRegionPixels(pixels,samples,domain){
 const [x,y]=domain?.origin??[];
 if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||y<0||pixels?.format!=='rgb8'||pixels.width!==domain.width||pixels.height!==domain.height||!(pixels.data instanceof Uint8Array)||pixels.data.length!==pixels.width*pixels.height*3||x+pixels.width>samples.width||y+pixels.height>samples.height)fail('SOURCE_REGIONS_INVALID','A scoped proxy output has another coordinate frame.');
 const data=new Uint8Array(samples.width*samples.height*3);for(let row=0;row<pixels.height;row++)data.set(pixels.data.subarray(row*pixels.width*3,(row+1)*pixels.width*3),((row+y)*samples.width+x)*3);
 return{width:samples.width,height:samples.height,format:'rgb8',data,membership:new Uint8Array(samples.membership),previewCoordinates:'source'};
}
