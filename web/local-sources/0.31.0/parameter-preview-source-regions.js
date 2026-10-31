import {compileOriginalSourceRegions} from './unified-engine/src/source-region-geometry.js';
import {sourceRegionTransportBytes} from './unified-engine/src/source-region-transport.js';
const MAX_RECTS=8192,MAX_SIDE=2048;
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const check=signal=>{if(signal?.aborted)throw signal.reason??Object.assign(Error('Scoped parameter sampling cancelled.'),{code:'CANCELLED'});};
const shape=(x0,y0,x1,y1)=>({x0,y0,x1,y1,polygon:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]});
/** Literal samples on the existing integer grid. Planning sees geometry only. */
export function planParameterRegionSamples(domain,maxSide=192){
 if(!domain||typeof domain.rowIntervals!=='function'||!Number.isSafeInteger(maxSide)||maxSide<1||maxSide>MAX_SIDE||domain.empty)fail('PREVIEW_UNAVAILABLE','A nonempty compiled domain and bounded preview side are required.');
 const step=Math.max(1,Math.ceil(Math.max(domain.width,domain.height)/maxSide)),width=Math.ceil(domain.width/step),height=Math.ceil(domain.height/step),pixels=width*height;
 return{schema:'parameter-preview-region-grid/1',width,height,step,pixels,logicalWidth:domain.width,logicalHeight:domain.height,origin:[...domain.origin],parentFingerprint:domain.fingerprint,metadataBytes:sourceRegionTransportBytes(domain.descriptor,{allowAliases:true})*2+65536+MAX_RECTS*512,bufferBytes:pixels*4};
}
export function parameterRegionMembership(domain,plan){
 const {width,height,step}=plan,mask=new Uint8Array(width*height),rectangles=[];let active=new Map(),included=0;
 for(let row=0;row<height;row++){
  const spans=[];for(const[a,b]of domain.rowIntervals(row*step)){const x0=Math.max(0,Math.ceil(a/step)),x1=Math.min(width,Math.ceil(b/step));if(x1<=x0)continue;const last=spans.at(-1);if(last&&x0<=last[1])last[1]=Math.max(last[1],x1);else spans.push([x0,x1]);}
  const next=new Map();for(const[x0,x1]of spans){mask.fill(1,row*width+x0,row*width+x1);included+=x1-x0;const key=x0+':'+x1,old=active.get(key);if(old){old.y1=row+1;old.polygon[2][1]=old.polygon[3][1]=row+1;next.set(key,old);}else{if(rectangles.length>=MAX_RECTS)fail('PREVIEW_UNAVAILABLE','The sampled membership exceeds its admitted rectangle complexity.');const rect=shape(x0,row,x1,row+1);rectangles.push(rect);next.set(key,rect);}}active=next;
 }
 if(!included)fail('PREVIEW_UNAVAILABLE','The provisional grid has no admitted original samples.');
 return{mask,rectangles,included};
}
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
/** Bind exact sampled membership to the independently encoded PNG identity. */
export async function parameterRegionDerivedDomain(samples,sha256){
 if(!samples||samples.schema!=='parameter-preview-region-grid/1'||!/^[a-f0-9]{64}$/.test(sha256??'')||!(samples.membership instanceof Uint8Array)||samples.membership.length!==samples.width*samples.height||!Array.isArray(samples.rectangles)||samples.rectangles.length>MAX_RECTS)fail('INVALID_INPUT','A verified sampled membership and derived PNG SHA are required.');
 const snapshot={schema:'sherloq.source-regions/1',sourceSha256:sha256,width:samples.width,height:samples.height,revision:0,enabled:true,positiveMode:'selected',zones:samples.rectangles.map((rect,i)=>({id:'sample-span-'+i,kind:'acquisition',enabled:true,...rect,origin:'derived-proxy-membership'}))},domain=await compileOriginalSourceRegions(snapshot);
 if(domain.countIncluded!==samples.included)fail('SOURCE_REGIONS_INVALID','Derived preview membership population changed.');
 for(let y=0;y<samples.height;y++)for(let x=0;x<samples.width;x++)if(domain.containsOriginal(x,y)!==!!samples.membership[y*samples.width+x])fail('SOURCE_REGIONS_INVALID','Derived preview membership differs from its sampled centres.');
 return domain.descriptor;
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
