// Independent RGB16 resampling implementation. MKS2021 polynomial mathematics:
// https://raw.githubusercontent.com/libvips/libvips/master/libvips/resample/templates.h
// No libvips source code is copied. See PROVENANCE.md for scope and references.
const fail=(code,message,details)=>Object.assign(Error(message),{code,details});
const check=signal=>{if(signal?.aborted)throw fail('CANCELLED','RGB16 proxy cancelled.');};
export function proxyDimensions(width,height,maxSide=512){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(width*height)||width*height>=2**31)throw fail('INVALID_INPUT','Invalid RGB16 dimensions.');
 if(maxSide===0||maxSide==='native')return{width,height};
 if(!Number.isSafeInteger(maxSide)||maxSide<1||maxSide>2048)throw fail('INVALID_INPUT','Proxy maximum side must be within1..2048 or native.');
 const ratio=Math.min(1,maxSide/Math.max(width,height));return{width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio))};
}
// Coefficients of the five even piecewise quadratic branches, evaluated in
// Horner form. This is a mathematical implementation, not a source translation.
const polynomial=[[-956,0,577,576],[140,-379,239,144],[-24,113,-130,144],[4,-27,45,144],[-4,36,-81,1152]];
export function mks2021(x){x=Math.abs(x);if(x>=4.5)return 0;const c=polynomial[Math.floor(x+.5)];return((c[0]*x+c[1])*x+c[2])/c[3];}
const align8=n=>Math.ceil(n/8)*8;
export function rgb16ProxyPlan(width,height,maxSide=512){
 const target=proxyDimensions(width,height,maxSide),tw=target.width,th=target.height,iw=Math.min(width,2*tw),ih=Math.min(height,2*th),identity=tw===width&&th===height;
 const tx=iw===tw?1:Math.ceil(9*iw/tw)+2,ty=ih===th?1:Math.ceil(9*ih/th)+2,cacheRows=ty+2,sections=[];let bytes=0;
 const add=(name,Type,length)=>{bytes=align8(bytes);sections.push({name,Type,length,offset:bytes});bytes+=Type.BYTES_PER_ELEMENT*length;};
 add('input',Uint16Array,3*width);add('horizontalArea',Float64Array,3*iw);add('areaSum',Float64Array,3*iw);
 add('xIndex',Int32Array,tw*tx);add('xWeight',Float64Array,tw*tx);add('xCount',Int32Array,tw);
 add('yIndex',Int32Array,th*ty);add('yWeight',Float64Array,th*ty);add('yCount',Int32Array,th);
 add('cacheTags',Int32Array,cacheRows);add('cache',Float64Array,cacheRows*3*tw);
 bytes=align8(bytes);const outputBytes=6*tw*th;
 if(!Number.isSafeInteger(bytes)||!Number.isSafeInteger(outputBytes))throw fail('INVALID_INPUT','Proxy allocation extent overflow.');
 return{sourceWidth:width,sourceHeight:height,width:tw,height:th,intermediateWidth:iw,intermediateHeight:ih,identity,tx,ty,cacheRows,workspaceBytes:bytes,outputBytes,peakNewBytes:bytes+outputBytes,sections};
}
function bank(Type,length,budget,label){
 const bytes=length*Type.BYTES_PER_ELEMENT,owner={data:null,backing:null,credit:null,closed:false};owner.credit=budget.reserve(bytes);
 const dispose=()=>{if(owner.closed)return;owner.data=null;if(owner.backing){owner.backing();owner.backing=null;}if(owner.credit){owner.credit();owner.credit=null;}owner.closed=true;};
 try{owner.data=new Type(length);owner.backing=budget.registerBacking?.('array-buffer',bytes,{owner:'sherloq7c-rgb16-proxy',label,identity:owner.data.buffer});}
 catch(error){try{dispose();}catch(cleanup){error.cleanupError=cleanup;error.retryCleanup=dispose;}throw error;}
 return{owner,dispose};
}
function leaseOutput(bank,width,height,metrics){
 let live=bank;bank=null;
 return Object.freeze({width,height,metrics:Object.freeze(metrics),get data(){if(!live||live.owner.closed||!live.owner.data)throw fail('DISPOSED','Proxy RGB16 lease was released.');return live.owner.data;},release(){if(!live)return;live.dispose();live=null;}});
}
function retire(state,keepOutput=false){
 state.ctx=null;const errors=[];
 for(const key of['workspace','releaseSource'])try{if(state[key]){if(key==='releaseSource')state[key]();else state[key].dispose();state[key]=null;}}catch(error){errors.push(error);}
 if(!keepOutput||errors.length)try{if(state.output){state.output.dispose();state.output=null;}}catch(error){errors.push(error);}
 if(errors.length)throw new AggregateError(errors,'RGB16 proxy retirement incomplete.');
}
function taps(source,target,indices,weights,counts,maximum){
 if(source===target){for(let i=0;i<target;i++){counts[i]=1;indices[i*maximum]=i;weights[i*maximum]=1;}return;}
 const scale=source/target;
 for(let i=0;i<target;i++){
  const center=(i+.5)*scale-.5,left=Math.ceil(center-4.5*scale),right=Math.floor(center+4.5*scale);let used=0,total=0;
  for(let x=left;x<=right;x++){const weight=mks2021((x-center)/scale);if(!weight)continue;const index=Math.max(0,Math.min(source-1,x));total+=weight;
   if(used&&indices[i*maximum+used-1]===index)weights[i*maximum+used-1]+=weight;
   else{if(used>=maximum)throw fail('INTERNAL_ERROR','Proxy tap capacity exceeded.');indices[i*maximum+used]=index;weights[i*maximum+used]=weight;used++;}}
  if(!used||!Number.isFinite(total)||total===0)throw fail('NUMERIC_PRECISION','Invalid RGB16 filter normalization.');
  counts[i]=used;for(let k=0;k<used;k++)weights[i*maximum+k]/=total;
 }
}
export async function resampleSourceToU16(source,{maxSide=512,budget,signal,onProgress,readRgb16Span}={}){
 if(!source||!budget?.reserve||onProgress!==undefined&&typeof onProgress!=='function'||readRgb16Span!==undefined&&typeof readRgb16Span!=='function')throw fail('INVALID_INPUT','RGB16 source, real budget and supported hooks required.');
 check(signal);const plan=rgb16ProxyPlan(source.width,source.height,maxSide),{sourceWidth:sw,sourceHeight:sh,width:tw,height:th,intermediateWidth:iw,intermediateHeight:ih}=plan;
 let flat=source.data??null;if(flat&&(!(flat instanceof Uint16Array)||flat.length!==3*sw*sh||source.immutable!==true))throw fail('INVALID_INPUT','A flat RGB16 source must be immutable and have the exact extent.');
 const rowReader=typeof source.readRows==='function'?source.readRows.bind(source):null,spanReader=readRgb16Span??(typeof source.readRgb16Span==='function'?source.readRgb16Span.bind(source):null),sampleReader=typeof source.sampleAt==='function'?source.sampleAt.bind(source):null;
 if(!flat&&!rowReader&&!spanReader&&!sampleReader)throw fail('INVALID_INPUT','No RGB16 reader available.');
 if(!flat&&rowReader&&(source.passes??1)!==1)throw fail('PROXY_SOURCE_REQUIRES_RESIDENT','Multipass lazy decoding must first be materialized by the resident source owner.');
 const reader=flat?'flat-u16':spanReader?'rgb16-span':rowReader?'lazy-readRows':'sampleAt-fallback',started=performance.now(),state={ctx:null,workspace:null,output:null,releaseSource:null};
 let ctx=null,output=null,nextYield=performance.now()+8,nextProgress=0,readCount=0,clippedSamples=0;
 const cooperate=async()=>{check(signal);if(performance.now()<nextYield)return;await new Promise((resolve,reject)=>{let channel;try{if(typeof MessageChannel==='function'){channel=new MessageChannel();channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};channel.port2.postMessage(0);}else setTimeout(resolve,0);}catch(error){channel?.port1.close();channel?.port2.close();reject(error);}});check(signal);nextYield=performance.now()+8;};
 const progress=(rows,force=false)=>{check(signal);const now=performance.now();if(!onProgress||!force&&now<nextProgress)return;nextProgress=now+150;onProgress({phase:'rgb16-proxy-resampling',rows,totalRows:sh,width:tw,height:th,elapsedMs:now-started});check(signal);};
 try{
  state.releaseSource=typeof source.retain==='function'?source.retain():null;
  state.output=bank(Uint16Array,3*tw*th,budget,'immutable RGB16 proxy output');state.workspace=bank(Uint8Array,plan.workspaceBytes,budget,'streaming RGB16 proxy workspace');
  ctx=state.ctx={};for(const part of plan.sections)ctx[part.name]=new part.Type(state.workspace.owner.data.buffer,part.offset,part.length);ctx.cacheTags.fill(-1);
  taps(iw,tw,ctx.xIndex,ctx.xWeight,ctx.xCount,plan.tx);taps(ih,th,ctx.yIndex,ctx.yWeight,ctx.yCount,plan.ty);
  let lastSource=-1,lastIntermediate=-1;
  async function horizontalArea(y){
   if(y===lastSource)return;check(signal);let samples=flat,offset=3*sw*y;
   if(!flat){samples=ctx.input;offset=0;if(spanReader){const r=spanReader(samples,3*sw*y);if(r?.then)await r;}else if(rowReader){const r=rowReader(y,1,samples,{signal,pass:0});if(r?.then)await r;}else for(let i=0;i<samples.length;i++)samples[i]=sampleReader(3*sw*y+i);}
   check(signal);readCount++;const out=ctx.horizontalArea;
   if(sw===iw)for(let i=0;i<out.length;i++)out[i]=samples[offset+i];
   else{const scale=sw/iw;for(let x=0;x<iw;x++){const left=x*scale,right=(x+1)*scale,first=Math.floor(left),last=Math.min(sw-1,Math.ceil(right)-1);let r=0,g=0,b=0;
    if(first===last){const at=offset+3*first;r=samples[at];g=samples[at+1];b=samples[at+2];}
    else{let at=offset+3*first;const weight=first+1-left;r=samples[at]*weight;g=samples[at+1]*weight;b=samples[at+2]*weight;
     for(let j=first+1;j<last;j++){at=offset+3*j;r+=samples[at];g+=samples[at+1];b+=samples[at+2];}
     at=offset+3*last;const endWeight=right-last;r=(r+samples[at]*endWeight)/scale;g=(g+samples[at+1]*endWeight)/scale;b=(b+samples[at+2]*endWeight)/scale;}
    const at=3*x;out[at]=r;out[at+1]=g;out[at+2]=b;}}
   samples=null;lastSource=y;progress(y+1);await cooperate();
  }
  async function produce(row){
   const sum=ctx.areaSum;sum.fill(0);const scale=sh/ih,left=row*scale,right=(row+1)*scale,first=Math.floor(left),last=Math.min(sh-1,Math.ceil(right)-1);
   for(let y=first;y<=last;y++){await horizontalArea(y);const weight=Math.min(y+1,right)-Math.max(y,left),line=ctx.horizontalArea;for(let i=0;i<sum.length;i++)sum[i]+=line[i]*weight;}
   const slot=row%plan.cacheRows,start=slot*3*tw;
   for(let x=0;x<tw;x++){let r=0,g=0,b=0;const base=x*plan.tx;for(let k=0;k<ctx.xCount[x];k++){const at=3*ctx.xIndex[base+k],weight=ctx.xWeight[base+k];r+=sum[at]*weight;g+=sum[at+1]*weight;b+=sum[at+2]*weight;}const at=start+3*x;ctx.cache[at]=r/scale;ctx.cache[at+1]=g/scale;ctx.cache[at+2]=b/scale;}
   ctx.cacheTags[slot]=row;lastIntermediate=row;
  }
  output=state.output.owner.data;
  if(plan.identity){for(let y=0;y<sh;y++){await horizontalArea(y);const line=ctx.horizontalArea;for(let i=0;i<3*sw;i++)output[3*sw*y+i]=line[i];}}
  else for(let y=0;y<th;y++){
   const base=y*plan.ty,count=ctx.yCount[y],maximum=ctx.yIndex[base+count-1];while(lastIntermediate<maximum)await produce(lastIntermediate+1);
   for(let x=0;x<tw;x++){let r=0,g=0,b=0;for(let k=0;k<count;k++){const row=ctx.yIndex[base+k],slot=row%plan.cacheRows;if(ctx.cacheTags[slot]!==row)throw fail('INTERNAL_ERROR','Proxy row cache was overwritten before use.');const at=slot*3*tw+3*x,weight=ctx.yWeight[base+k];r+=ctx.cache[at]*weight;g+=ctx.cache[at+1]*weight;b+=ctx.cache[at+2]*weight;}
    const at=3*(y*tw+x);if(r<0||r>65535)clippedSamples++;if(g<0||g>65535)clippedSamples++;if(b<0||b>65535)clippedSamples++;output[at]=Math.round(Math.max(0,Math.min(65535,r)));output[at+1]=Math.round(Math.max(0,Math.min(65535,g)));output[at+2]=Math.round(Math.max(0,Math.min(65535,b)));}await cooperate();
  }
  check(signal);progress(sh,true);const metrics={algorithm:plan.identity?'identity-rgb16-copy':'streaming-area+mks2021',reader,sourceWidth:sw,sourceHeight:sh,width:tw,height:th,intermediateWidth:iw,intermediateHeight:ih,outputBitDepth:16,workingPrecision:'float64',valueDomain:'native-rgb16-no-colour-conversion',outputBytes:plan.outputBytes,workspaceBytes:plan.workspaceBytes,peakNewBytes:plan.peakNewBytes,rowCacheRows:plan.cacheRows,sourceRowsRead:readCount,clippedSamples,elapsedMs:performance.now()-started,noTemporaryStorage:true,upscaled:false};
  flat=null;source=null;ctx=null;output=null;retire(state,true);metrics.elapsedMs=performance.now()-started;const result=leaseOutput(state.output,tw,th,metrics);state.output=null;return result;
 }catch(error){
  flat=null;source=null;ctx=null;output=null;
  let previousRetry=typeof error?.retryCleanup==='function'?error.retryCleanup:null;
  try{retire(state);}catch(cleanup){
   const primary=error&&typeof error==='object'&&Object.isExtensible(error)?error:fail('CLEANUP_FAILED','RGB16 proxy and retirement failed.',{cause:String(error)});
   const earlier=[...(Array.isArray(error?.cleanupErrors)?error.cleanupErrors:[]),...(error?.cleanupError?[error.cleanupError]:[])];
   primary.cleanupErrors=[...earlier,cleanup];primary.cleanupError=new AggregateError(primary.cleanupErrors,'RGB16 proxy has multiple pending retirements.');
   primary.retryCleanup=()=>{const failures=[];if(previousRetry)try{previousRetry();previousRetry=null;}catch(e){failures.push(e);}try{retire(state);}catch(e){failures.push(e);}if(failures.length)throw new AggregateError(failures,'RGB16 proxy retirement remains pending.');};
   throw primary;
  }
  throw error;
 }
}
export const createProxyRgb16=resampleSourceToU16;
