import {DISPLAY_PREVIEW_MAX_SIDE as ADAPTIVE_PREVIEW_MAX_SIDE,DISPLAY_PREVIEW_MAX_PIXELS as ADAPTIVE_PREVIEW_MAX_PIXELS} from './preview-limits.js';
import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
const MAX_RECTS=8192,MAX_SIDE=ADAPTIVE_PREVIEW_MAX_SIDE;
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const check=signal=>{if(signal?.aborted)throw signal.reason??Object.assign(Error('Scoped parameter sampling cancelled.'),{code:'CANCELLED'});};
const shape=(x0,y0,x1,y1)=>({x0,y0,x1,y1,polygon:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]});
/** Literal samples on the existing integer grid. Planning sees geometry only. */
export function planParameterRegionSamples(domain,maxSide=192){
 if(!domain||typeof domain.rowIntervals!=='function'||!Number.isSafeInteger(maxSide)||maxSide<1||maxSide>MAX_SIDE||domain.empty)fail('PREVIEW_UNAVAILABLE','A nonempty compiled domain and bounded preview side are required.');
 const step=Math.max(1,Math.ceil(Math.max(domain.width,domain.height)/maxSide));return parameterRegionGrid(domain,step);
}
export function parameterRegionGrid(domain,step){
 if(!domain||typeof domain.rowIntervals!=='function'||domain.empty||!Number.isSafeInteger(step)||step<1)fail('PREVIEW_UNAVAILABLE','A nonempty compiled domain and literal integer step are required.');
 const width=Math.ceil(domain.width/step),height=Math.ceil(domain.height/step),pixels=width*height;
 if(width>MAX_SIDE||height>MAX_SIDE||pixels>ADAPTIVE_PREVIEW_MAX_PIXELS)fail('PREVIEW_UNAVAILABLE','The sampled domain exceeds the admitted grid.');
 return{schema:'parameter-preview-region-grid/1',width,height,step,pixels,logicalWidth:domain.width,logicalHeight:domain.height,origin:[...domain.origin],parentFingerprint:domain.fingerprint,metadataBytes:sourceRegionTransportBytes(domain.descriptor,{allowAliases:true})*2+65536+MAX_RECTS*512,bufferBytes:pixels*4};
}
export function parameterRegionMembership(domain,plan,{target}={}){
 const {width,height,step}=plan;if(target!==undefined&&(!(target instanceof Uint8Array)||target.length!==width*height))fail('INVALID_INPUT','Sampled membership target has another extent.');
 const mask=target??new Uint8Array(width*height);mask.fill(0);const rectangles=[];let active=new Map(),included=0;
 for(let row=0;row<height;row++){
  const spans=[];for(const[a,b]of domain.rowIntervals(row*step)){const x0=Math.max(0,Math.ceil(a/step)),x1=Math.min(width,Math.ceil(b/step));if(x1<=x0)continue;const last=spans.at(-1);if(last&&x0<=last[1])last[1]=Math.max(last[1],x1);else spans.push([x0,x1]);}
  const next=new Map();for(const[x0,x1]of spans){mask.fill(1,row*width+x0,row*width+x1);included+=x1-x0;const key=x0+':'+x1,old=active.get(key);if(old){old.y1=row+1;old.polygon[2][1]=old.polygon[3][1]=row+1;next.set(key,old);}else{if(rectangles.length>=MAX_RECTS)fail('PREVIEW_UNAVAILABLE','The sampled membership exceeds its admitted rectangle complexity.');const rect=shape(x0,row,x1,row+1);rectangles.push(rect);next.set(key,rect);}}active=next;
 }
 if(!included)fail('PREVIEW_UNAVAILABLE','The provisional grid has no admitted original samples.');
 return{mask,rectangles,included};
}
/** Bind exact sampled membership to the independently encoded PNG identity. */
export async function parameterRegionDerivedDomain(samples,sha256){
 if(!samples||samples.schema!=='parameter-preview-region-grid/1'||!/^[a-f0-9]{64}$/.test(sha256??'')||!(samples.membership instanceof Uint8Array)||samples.membership.length!==samples.width*samples.height||!Array.isArray(samples.rectangles)||samples.rectangles.length>MAX_RECTS)fail('INVALID_INPUT','A verified sampled membership and derived PNG SHA are required.');
 const snapshot={schema:'sherloq.source-regions/1',sourceSha256:sha256,width:samples.width,height:samples.height,revision:0,enabled:true,positiveMode:'selected',zones:samples.rectangles.map((rect,i)=>({id:'sample-span-'+i,kind:'acquisition',enabled:true,...rect,origin:'derived-proxy-membership'}))},domain=await compileOriginalSourceRegions(snapshot);
 if(domain.countIncluded!==samples.included)fail('SOURCE_REGIONS_INVALID','Derived preview membership population changed.');
 for(let y=0;y<samples.height;y++)for(let x=0;x<samples.width;x++)if(domain.containsOriginal(x,y)!==!!samples.membership[y*samples.width+x])fail('SOURCE_REGIONS_INVALID','Derived preview membership differs from its sampled centres.');
 return domain.descriptor;
}


/** Presentation receipts describe the exact Original lattice, never a newly
 * encoded or quantized scientific Source. No image data is read here. */
export function assertNativeRegionPreviewSampling(value,domain,{width,height,step,native,sourceSha256}={}){
 const origin=domain?.origin;
 if(!value||value.schema!=='parameter-preview-region-grid/1'||value.parentFingerprint!==domain?.fingerprint||!/^[a-f0-9]{64}$/.test(value.derivedFingerprint??'')||value.step!==step||value.width!==width||value.height!==height||!Array.isArray(value.origin)||value.origin.length!==2||value.origin.some((n,i)=>n!==origin?.[i])||!Number.isSafeInteger(value.includedSamples)||value.includedSamples<1||value.includedSamples>width*height||value.missingSamples!==width*height-value.includedSamples||step===1&&value.derivedFingerprint!==domain.fingerprint)fail('SOURCE_REGIONS_INVALID','Native preview receipt belongs to another Original sampling lattice.');
 if(native&&(value.nativeSurfaceId!==native.id||value.nativeRevision!==native.revision||value.sourceSha256!==sourceSha256))fail('SOURCE_REGIONS_INVALID','Native preview receipt belongs to another Original owner.');
 return value;
}
