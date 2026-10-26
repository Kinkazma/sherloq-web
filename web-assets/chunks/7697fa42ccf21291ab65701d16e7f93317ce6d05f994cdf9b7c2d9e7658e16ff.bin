import "../../runtime-context.js?v=0.25.0";
import {observedDerivativeWorkingBytes} from './source-region-observed-derivatives.js';
import {observedSeparationWorkingBytes} from './source-region-observed-separation.js';
import {ramByteCacheBytes} from './ram-byte-cache.js';
import {migrationWorkspaceBytes} from './migration-workspace.js';
/** Complete resident alternatives for the three qualified single-thread native
 * adapters. These are admission bounds, never altered scientific parameters.
 * Unknown/dynamic/parallel adapters return null and retire the optional cache.
 */
export function externalPreviewNativeHeadroom(operation,image,params,{runtimeBytes=0}={}){
 const d=image?.surface?.descriptor;if(!d||![runtimeBytes,d.width,d.height].every(Number.isSafeInteger)||runtimeBytes<0||d.width<1||d.height<1)return null;
 const io=image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*1024**2:0;
 let bytes;
 if(operation==='various.illuminant'){
  const w=d.width,h=d.height,n=w*h;if(!Number.isSafeInteger(params?.block)||params.block<1)return null;const cols=Math.ceil(w/params.block),rows=Math.ceil(h/params.block),cells=cols*rows,dataBytes=cells*41+24,overhead=dataBytes*3+cells*3+cols*3072+cols*4+6144+io+Math.max(w,h)*3+32768,group=Math.min(h,Math.max(1,Math.floor(262144/w)));
  // RGB result, complete native cell analysis, row staging plus source/I/O copy.
  bytes=runtimeBytes+n*3+Math.max(overhead+w*6,overhead+group*w*9)+65536;
 }else if(operation==='colors.stats'||operation==='noise.planes'){
  const w=d.sourceWidth,h=d.sourceHeight,n=w*h,chunk=image.store?.chunkBytes;
  if(![w,h,n,chunk].every(Number.isSafeInteger)||w<1||h<1||chunk<3||image.store.byteLength!==n*3)return null;
  if(operation==='colors.stats')bytes=runtimeBytes+n*3+Math.max(Math.min(n*6,8*1024**2)+io,Math.min(chunk,n*3)*2+io)+65536;
  else{const rows=Math.min(h,Math.max(1,Math.floor(4*1024**2/(w*4))-2)),display=Math.min(h,rows+2)*w*4;bytes=runtimeBytes+n*4+Math.max(Math.min(8*1024**2,n*4+w*8)+io,Math.ceil(Math.min(chunk,n*3)/3)*4+io,display+io)+65536;}
 }else return null;
 return Number.isSafeInteger(bytes)&&bytes>0?{bytes,operation,completeResidentAlternative:true,parallelWorkers:0}:null;
}

/** Complete RAM alternative for the actual serial strict Sobel adapter only.
 * `domain` has already passed prepareSourceRegionDomain. Rectangle/identity
 * routes use segmentedGradient's useful parallel workers and must still reclaim.
 * This optional cache never changes the adapter's storage/worker decisions. */
export function externalPreviewScopedGradientHeadroom(operation,domain,{runtimeBytes=0,transportBytes=0,image}={}){
 if(operation!=='detail.gradient'||!domain||![runtimeBytes,transportBytes,domain.width,domain.height,domain.countIncluded].every(Number.isSafeInteger)||runtimeBytes<0||transportBytes<0||domain.width<1||domain.height<1||domain.countIncluded<1||typeof domain.rowIntervals!=='function')return null;
 const envelope=domain.width*domain.height,observations=domain.countIncluded,pageBytes=image?.session?.snapshot?.().pageBytes;if(pageBytes!==undefined&&(!Number.isSafeInteger(pageBytes)||pageBytes<1))return null;const migration=(image?.session||image?.ensureTemporarySession)?migrationWorkspaceBytes(Math.max(envelope*3,observations*4),image.session):0;
 // output RGB + scope; derivative store + its optional complete RAM cache.
 // Include the fixed64MiB native heap even when the runtime already owns it.
 // The16MiB remainder covers <=1MiB core
 // staging, source-row/read copies, histogram/stats and published descriptors.
 const components={runtime:runtimeBytes,nativeHeap:64*1024**2,migrationWorkspace:migration,resultAndScope:envelope*4,derivativesAndCache:observations*8+48,metadata:transportBytes*8+131072,stagingAndIO:16*1024**2+Math.max(domain.width,32768)*16},bytes=Object.values(components).reduce((n,v)=>n+v,0);
 return Object.values(components).every(Number.isSafeInteger)&&Number.isSafeInteger(bytes)&&bytes>0?{bytes,operation,completeResidentAlternative:true,parallelWorkers:0,strictScopedGradient:true,components}:null;
}

/** Complete RAM alternative for the existing serial strict Adjust adapters.
 * Identity/rectangle/ordinary routes retain their useful parallel admission.
 * This bound never changes kernels, native chunk sizes or optional native caches.
 */
export function externalPreviewScopedAdjustHeadroom(operation,domain,params,{runtimeBytes=0,transportBytes=0,image}={}){
 if(operation!=='inspection.adjust'||!domain||![runtimeBytes,transportBytes,domain.width,domain.height,domain.countIncluded].every(Number.isSafeInteger)||runtimeBytes<0||transportBytes<0||domain.width<1||domain.height<1||domain.countIncluded<1||domain.countIncluded>domain.width*domain.height||typeof domain.rowIntervals!=='function'||!Number.isInteger(params?.sharpen)||params.sharpen<0||params.sharpen>100||!Number.isInteger(params.equalize)||params.equalize<0||params.equalize>5)return null;
 const w=domain.width,h=domain.height,n=w*h,r=Math.floor(params.sharpen/4),neighbour=params.sharpen!==0||params.equalize>1,d=image?.surface?.descriptor,sourceDimensions=d?[d.sourceWidth??d.width,d.sourceHeight??d.height]:[w,h],pageBytes=image?.session?.snapshot?.().pageBytes;
 if(!sourceDimensions.every(v=>Number.isSafeInteger(v)&&v>0)||pageBytes!==undefined&&(!Number.isSafeInteger(pageBytes)||pageBytes<1))return null;
 const migration=(image?.session||image?.ensureTemporarySession)?migrationWorkspaceBytes(n*3,image.session):0;
 const components={runtime:runtimeBytes,nativeHeap:64*1024**2,metadata:transportBytes*12+262144,sourceAndIO:16*1024**2+Math.max(w,h,...sourceDimensions,32768)*16,migrationWorkspace:migration,resultAndScope:n*(neighbour?4:3),nativePrefixCache:neighbour?ramByteCacheBytes(n*3,2048)+ramByteCacheBytes(n,2048):0,staging:neighbour?32*Math.min(w,128+2*r)*Math.min(h,32+2*r)+8*w+512*1024:12*Math.min(n,262144)},bytes=Object.values(components).reduce((sum,v)=>sum+v,0);
 return Object.values(components).every(v=>Number.isSafeInteger(v)&&v>=0)&&Number.isSafeInteger(bytes)&&bytes>0?{bytes,operation,completeResidentAlternative:true,parallelWorkers:0,strictScopedAdjust:true,branch:neighbour?'neighbour':'simple',components}:null;
}

/** Complete resident RAM alternative for the existing serial strict Echo path.
 * Radius, derivative kernels, extrema, scientific caches and native cores are
 * unchanged. Ordinary/rectangle routes keep their own parallel admission. */
export function externalPreviewScopedEchoHeadroom(operation,domain,params,{runtimeBytes=0,transportBytes=0,image}={}){
 if(operation!=='detail.echo'||!domain||![runtimeBytes,transportBytes,domain.width,domain.height,domain.countIncluded].every(Number.isSafeInteger)||runtimeBytes<0||transportBytes<0||domain.width<1||domain.height<1||domain.countIncluded<1||domain.countIncluded>domain.width*domain.height||typeof domain.rowIntervals!=='function'||!Number.isInteger(params?.radius)||params.radius<1||params.radius>15)return null;
 const w=domain.width,h=domain.height,envelope=w*h,observations=domain.countIncluded,r=params.radius,d=image?.surface?.descriptor,sourceDimensions=d?[d.sourceWidth??d.width,d.sourceHeight??d.height]:[w,h],pageBytes=image?.session?.snapshot?.().pageBytes;
 if(![envelope,envelope*3,observations*12].every(Number.isSafeInteger)||!sourceDimensions.every(v=>Number.isSafeInteger(v)&&v>0)||pageBytes!==undefined&&(!Number.isSafeInteger(pageBytes)||pageBytes<1))return null;
 const migration=(image?.session||image?.ensureTemporarySession)?migrationWorkspaceBytes(Math.max(envelope*3,observations*12),image.session):0;
 const components={runtime:runtimeBytes,nativeHeap:64*1024**2,resultAndScope:4*envelope,derivativesAndCache:24*observations+96,metadata:12*transportBytes+262144,migrationWorkspace:migration,sourceAndIO:16*1024**2+16*Math.max(w,h,...sourceDimensions,32768),staging:Math.max((128+2*r)*(64+2*r)*32,observedDerivativeWorkingBytes(128,r,12))+131072+12288},bytes=Object.values(components).reduce((sum,v)=>sum+v,0);
 return Object.values(components).every(v=>Number.isSafeInteger(v)&&v>=0)&&Number.isSafeInteger(bytes)&&bytes>0?{bytes,operation,completeResidentAlternative:true,parallelWorkers:0,strictScopedEcho:true,components}:null;
}

/** Optional resident alternative for strict native frequency contexts only.
 * Enumerates the callee's own admitted rectangles, never pixels. The upper
 * power-of-two sizes finance native padding; no FFT dimension is changed.
 * Complexity/axis limits reject only this optional cache, not native work. */
export function externalPreviewScopedFrequencyHeadroom(operation,domain,{runtimeBytes=0,transportBytes=0,image,profile={},rectangles}={}){
 const w=domain?.width,h=domain?.height,I=domain?.countIncluded,C=profile.maxWorkers,MAX_AXIS=65536,MAX_RECTS=8192,P=262144,MiB=1024**2;
 if(operation!=='detail.frequency'||![runtimeBytes,transportBytes,w,h,I,C].every(Number.isSafeInteger)||runtimeBytes<0||transportBytes<0||w<1||h<1||w>MAX_AXIS||h>MAX_AXIS||I<1||I>w*h||C<1||typeof rectangles!=='function')return null;
 const E=w*h,d=image?.surface?.descriptor,sourceDimensions=d?[d.sourceWidth??d.width,d.sourceHeight??d.height]:[w,h],pageBytes=image?.session?.snapshot?.().pageBytes;
 if(!sourceDimensions.every(v=>Number.isSafeInteger(v)&&v>0)||pageBytes!==undefined&&(!Number.isSafeInteger(pageBytes)||pageBytes<1))return null;
 const upper=n=>{if(!Number.isSafeInteger(n)||n<1||n>=2125764000||n>MAX_AXIS)return null;let value=1;while(value<n)value*=2;return value;};
 let K=0,S=0,F=0,Fmax=0,U=0,Vsum=0;
 for(const r of rectangles()){
  if(++K>MAX_RECTS||!r||![r.x,r.y,r.width,r.height].every(Number.isSafeInteger)||r.x<0||r.y<0||r.width<1||r.height<1||r.x+r.width>w||r.y+r.height>h)return null;
  const u=upper(r.width),v=upper(r.height);if(u===null||v===null)return null;const f=u*v;S+=r.width*r.height;F+=f;Fmax=Math.max(Fmax,f);U=Math.max(U,u);Vsum+=v;
  if(![S,F,Fmax,U,Vsum].every(Number.isSafeInteger)||S>I)return null;
 }
 if(!K||S!==I)return null;const A=U*Vsum,largestBank=Math.max(8*Fmax,3*A,3*E);if(![A,largestBank].every(Number.isSafeInteger))return null;
 const migration=(image?.session||image?.ensureTemporarySession)?migrationWorkspaceBytes(largestBank,image.session):0;
 const components={runtime:runtimeBytes,localHeapsAndNestedAdmission:256*MiB,nativeWorkers:C*(128*MiB+192*P),finalBanksAndCache:36*F+6*S,localTemporaries:32*Fmax,parentSourceAndAtlasOutputs:7*E+7*A,stripWorkspace:128*(P+30*U),metadata:12*transportBytes+262144+24576*K,sourceAndIO:16*MiB+16*Math.max(w,h,...sourceDimensions,32768),migrationWorkspace:migration},bytes=Object.values(components).reduce((sum,v)=>sum+v,0);
 return Object.values(components).every(v=>Number.isSafeInteger(v)&&v>=0)&&Number.isSafeInteger(bytes)&&bytes>0?{bytes,operation,completeResidentAlternative:true,parallelWorkers:C,strictScopedFrequency:true,components,geometry:{rectangles:K,sourcePixels:S,frequencyUpperPixels:F,maximumFrequencyUpperPixels:Fmax,atlasUpperWidth:U,atlasUpperHeight:Vsum,atlasUpperPixels:A},optionalOnlyLimits:{maximumAxis:MAX_AXIS,maximumRectangles:MAX_RECTS,nativeTerminalAxisExclusive:2125764000}}:null;
}

/** Optional complete RAM admission for the existing serial, strict separation
 * adapter only. Its native kernels, NLM7x7/21x21 support, residual histogram,
 * cache key and useful cores are unchanged. Rectangle/whole routes still retire
 * the optional preview rather than restrict their native parallel admission. */
export function externalPreviewScopedSeparationHeadroom(operation,domain,params,{runtimeBytes=0,transportBytes=0,image}={}){
 if(operation!=='noise.separation'||!domain||![runtimeBytes,transportBytes,domain.width,domain.height,domain.countIncluded].every(Number.isSafeInteger)||runtimeBytes<0||transportBytes<0||domain.width<1||domain.height<1||domain.countIncluded<1||domain.countIncluded>domain.width*domain.height||typeof domain.rowIntervals!=='function'||!Number.isInteger(params?.mode)||params.mode<0||params.mode>4||!Number.isInteger(params.radius)||params.radius<1||params.radius>10||!Number.isInteger(params.sigma)||params.sigma<1||params.sigma>200||!Number.isInteger(params.levels)||params.levels<0||params.levels>255||typeof params.grayscale!=='boolean'||typeof params.denoised!=='boolean')return null;
 const w=domain.width,h=domain.height,E=w*h,I=domain.countIncluded,r=params.mode===4?13:params.radius,d=image?.surface?.descriptor,sourceDimensions=d?[d.sourceWidth??d.width,d.sourceHeight??d.height]:[w,h],pageBytes=image?.session?.snapshot?.().pageBytes;
 if(![E,E*4,I*6].every(Number.isSafeInteger)||!sourceDimensions.every(v=>Number.isSafeInteger(v)&&v>0)||pageBytes!==undefined&&(!Number.isSafeInteger(pageBytes)||pageBytes<1))return null;
 // Finance both stores' possible migration workspaces, result+scope, both a
 // borrowed/native cache and construction copy, actual observed-boundary row
 // workspace, full source I/O and metadata before preserving the optional child.
 const migration=(image?.session||image?.ensureTemporarySession)?migrationWorkspaceBytes(E*3,image.session)+migrationWorkspaceBytes(E,image.session):0;
 const nativeStaging=Math.max((128+2*r)*(64+2*r)*12,observedSeparationWorkingBytes(128,r))+6144+131072;
 const components={runtime:runtimeBytes,nativeHeap:64*1024**2,resultAndScope:4*E,filterCacheAndCopy:6*I+12288,metadata:12*transportBytes+262144,migrationWorkspace:migration,sourceAndIO:16*1024**2+16*Math.max(w,h,...sourceDimensions,32768),staging:nativeStaging+(128+2*r)*(64+2*r)*16+128*64*12+8*32768+8192},bytes=Object.values(components).reduce((sum,v)=>sum+v,0);
 return Object.values(components).every(v=>Number.isSafeInteger(v)&&v>=0)&&Number.isSafeInteger(bytes)&&bytes>0?{bytes,operation,completeResidentAlternative:true,parallelWorkers:0,strictScopedSeparation:true,nativeHalo:r,components}:null;
}

// These two strict adapters use serial JS native criteria, not a Wasm arena or
// strip pool. Finance their full RAM alternative without changing the callee's
// storage choice. Page/cache and migration allowances intentionally overlap.
// Maps/strings/descriptors are explicit conservative policy credits, not a
// measurement or guarantee of browser heap/GC residency.
function serialScopedPreviewContext(domain,{runtimeBytes=0,transportBytes=0,coordinateBytes=0,image}={}){
 const w=domain?.width,h=domain?.height,I=domain?.countIncluded,d=image?.surface?.descriptor;
 if(!d||![runtimeBytes,transportBytes,coordinateBytes,w,h,I].every(Number.isSafeInteger)||runtimeBytes<0||transportBytes<0||coordinateBytes<0||w<1||h<1||I<1||I>w*h||typeof domain.rowIntervals!=='function')return null;
 const E=w*h,sourceDimensions=[d.sourceWidth??d.width,d.sourceHeight??d.height];let pageBytes=1024**2;
 try{if(image.session){if(typeof image.session.snapshot!=='function')return null;const state=image.session.snapshot();if(!state||typeof state!=='object')return null;pageBytes=state.pageBytes??pageBytes;}}catch{return null;}
 if(!Number.isSafeInteger(E)||!sourceDimensions.every(v=>Number.isSafeInteger(v)&&v>0)||!Number.isSafeInteger(pageBytes)||pageBytes<1)return null;
 return{w,h,E,I,runtimeBytes,transportBytes,coordinateBytes,image,pageBytes,sourceDimensions};
}
function serialScopedPreviewPlan(operation,context,stores,components,marker){
 const{w,h,runtimeBytes,transportBytes,coordinateBytes,image,pageBytes,sourceDimensions}=context;
 if(!stores.every(v=>Number.isSafeInteger(v)&&v>=0))return null;
 // At most w disjoint width>=1 core entries per row in each of active/next.
 // Also cover segmented-bank Map records independently of their byte payload.
 const metadata=12*transportBytes+4*coordinateBytes+262144+1024*w+1024*stores.reduce((sum,n)=>sum+Math.ceil(n/(4*1024**2)),0),migrationWorkspace=image.session||image.ensureTemporarySession?stores.reduce((sum,n)=>sum+2*Math.min(n,pageBytes),0):0;
 const all={runtime:runtimeBytes,...components,metadata,sourceAndIO:16*Math.max(1024**2,pageBytes)+16*Math.max(w,h,...sourceDimensions,32768),migrationWorkspace},bytes=Object.values(all).reduce((sum,n)=>sum+n,0);
 return Object.values(all).every(v=>Number.isSafeInteger(v)&&v>=0)&&Number.isSafeInteger(bytes)&&bytes>0?{bytes,operation,completeResidentAlternative:true,parallelWorkers:0,[marker]:true,components:all}:null;
}

/** Optional full-policy bound for sourceRegionMinmax only. Whole/rectangle
 * admission still reclaims the proxy. Native channel/colors/filter and cache
 * identity are unchanged; excluded observations never become input pixels. */
export function externalPreviewScopedMinmaxHeadroom(operation,domain,params,options={}){
 if(operation!=='noise.minmax'||!params||!['channel','minimum','maximum','filter'].every(key=>Number.isInteger(params[key])&&params[key]>=0&&params[key]<=(key==='filter'?5:4)))return null;
 const context=serialScopedPreviewContext(domain,options);if(!context)return null;const{w,h,E}=context,radius=params.filter+3,block=2*radius+1,cells=Math.ceil(w/block)*Math.ceil(h/block);
 if(!Number.isSafeInteger(cells))return null;
 return serialScopedPreviewPlan(operation,context,[3*E,E,E,E,E],{resultAndMasks:7*E,nativeCacheAndBorrow:8*E+256,densityWorkspace:params.filter?48*cells:0,staging:130*66*16+32768*8+6144},'strictScopedMinmax');
}

/** Optional full-policy bound for sourceRegionDefects only. All possible native
 * candidates are financed (3 channels * 6 Uint32 =72 bytes/admitted center).
 * Radius/threshold/spread/kind/mode, candidate order and native caches remain. */
export function externalPreviewScopedDefectsHeadroom(operation,domain,params,options={}){
 if(operation!=='pixels.defects'||!params||!Number.isInteger(params.radius)||params.radius<1||params.radius>2||!Number.isInteger(params.threshold)||params.threshold<1||params.threshold>255||!Number.isInteger(params.spread)||params.spread<0||params.spread>255||!Number.isInteger(params.kind)||params.kind<0||params.kind>2||!Number.isInteger(params.mode)||params.mode<0||params.mode>2)return null;
 const context=serialScopedPreviewContext(domain,options);if(!context)return null;const{w,E,I}=context,r=params.radius,table=72*I;
 return serialScopedPreviewPlan(operation,context,[3*E,3*E,3*E,E,E,E,table],{resultAndMasks:12*E,nativeCacheAndBorrow:16*E+512,candidateTable:table,staging:(128+2*r)*(64+2*r)*20+262144+32768*16+128,candidateRow:72*Math.min(w,32768)},'strictScopedDefects');
}
