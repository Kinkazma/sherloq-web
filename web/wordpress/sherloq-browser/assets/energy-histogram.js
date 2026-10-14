// Native distributions only. No RGB brightness histogram, draft resampling,
// JPEG recompression, percentile estimation or scientific map is created here.
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const check=signal=>{if(signal?.aborted)fail('CANCELLED','Energy histogram cancelled');};
const gray=(r,g,b)=>(r*9798+g*19235+b*3735+16384)>>15; // prepareEnergy's original-pixel validity.
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const midpointBin=(value,bounds,bins)=>Math.max(0,Math.min(bins-1,Math.floor((value-bounds[0])/(bounds[1]-bounds[0])*bins)));

export function createEnergyHistogram({engine,readOriginal,bins=256,maximumWindowBytes=1024*1024}={}){
 if(![256,512].includes(bins)||!Number.isSafeInteger(maximumWindowBytes)||maximumWindowBytes<1024||maximumWindowBytes>1024*1024)fail('INVALID_INPUT','Invalid native energy histogram bounds');
 const tokens=new WeakMap();let serial=0,version=0,disposed=false,active=null,scoreCache=null,referenceCache=null;
 const token=value=>{if(!value||typeof value!=='object')return null;const d=value.descriptor??value;if(typeof d.id==='string'&&Number.isSafeInteger(d.revision))return JSON.stringify([d.id,d.revision,d.width,d.height,d.format]);if(!tokens.has(value))tokens.set(value,++serial);return tokens.get(value);};
 const histogramBytes=bins*4+(bins+1)*8,capacity=Math.max(1,Math.floor(maximumWindowBytes/24));
 const reserve=async bytes=>engine?.reserveExternalMemory?engine.reserveExternalMemory({bytes}):null;
 const release=async lease=>{if(lease)await engine.releaseExternalMemory(lease.id);};
 function edges(bounds){const out=new Float64Array(bins+1);for(let i=0;i<=bins;i++)out[i]=i===bins?bounds[1]:bounds[0]+(bounds[1]-bounds[0])*i/bins;return out;}
 function validate(analysis,options){
  const d=analysis?.data,{width,height}=d??{},n=width*height;
  if(disposed)fail('DISPOSED','Energy histogram owner disposed');
  if((analysis?.operation??analysis?.provenance?.operation)!=='ela.energy'||typeof analysis.id!=='string'||!analysis.id||d?.preview||d?.metadata?.draft||analysis?.draft||d?.metadata?.method!=='ela_energy')fail('HISTOGRAM_NATIVE_REQUIRED','A retained native ELA energy result is required');
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(n)||n>=2**31)fail('INVALID_INPUT','Invalid native energy dimensions');
  const e=d.metadata.energy;if(!e||e.enabled!==true||!Array.isArray(e.quantiles)||e.quantiles.length!==2||e.quantiles.some(q=>!Number.isFinite(q)||q<0||q>1)||e.quantiles[0]>.5||e.quantiles[1]<.5||!Array.isArray(e.thresholds)||e.thresholds.length!==2||e.thresholds.some(q=>!Number.isFinite(q)||q<0))fail('INVALID_INPUT','Native energy profile metadata required');
  const sourceSha256=analysis.provenance?.originalSha256??d.metadata.sourceSha256;if(!/^[a-f0-9]{64}$/.test(sourceSha256||''))fail('HISTOGRAM_NATIVE_REQUIRED','The native original-image identity is required');
  const panels=d.energy_summary??e.panels??[];if(!Array.isArray(panels))fail('INVALID_INPUT','Invalid native reference panels');
  const ids=new Set();for(const p of panels){if(!Number.isSafeInteger(p?.id)||p.id<=0||ids.has(p.id)||!Array.isArray(p.bbox)||p.bbox.length!==4||p.bbox.some(v=>!Number.isSafeInteger(v))||p.bbox[0]<0||p.bbox[1]<0||p.bbox[2]>width||p.bbox[3]>height||p.bbox[0]>=p.bbox[2]||p.bbox[1]>=p.bbox[3]||!Array.isArray(p.probes)||p.probes.length!==3||p.probes.some(probe=>['q10','q90','central_mean','central_variance','low_mean','low_variance','high_mean','high_variance'].some(k=>!Number.isFinite(probe?.[k]))))fail('INVALID_INPUT','Invalid native reference panel statistics');ids.add(p.id);}
  const qualities=d.metadata.qualities??[];if(!Array.isArray(qualities)||qualities.length!==0&&qualities.length!==3||qualities.some(q=>!Number.isSafeInteger(q)||q<1||q>100))fail('INVALID_INPUT','Invalid native JPEG qualities');
  const quality=d.metadata.quality??null;let qualityIndex=options.qualityIndex;if(qualityIndex===undefined){const index=qualities.indexOf(quality);qualityIndex=index<0?1:index;}if(!Number.isInteger(qualityIndex)||qualityIndex<0||qualityIndex>2)fail('INVALID_INPUT','Invalid reference quality selection');
  let panel=null;if(options.referencePanelId!=null){panel=panels.find(p=>p.id===options.referencePanelId);if(!panel)fail('INVALID_INPUT','Unknown native reference panel');}else for(const p of panels)if(!panel||(p.bbox[2]-p.bbox[0])*(p.bbox[3]-p.bbox[1])>(panel.bbox[2]-panel.bbox[0])*(panel.bbox[3]-panel.bbox[1]))panel=p;
  const panelId=options.panelId??null;if(panelId!==null&&(!Number.isSafeInteger(panelId)||panelId<=0))fail('INVALID_INPUT','Invalid score panel selection');
  return {analysis,d,width,height,n,e,panels,ids,qualities,quality,qualityIndex,panel,panelId,sourceSha256};
 }
 function field(source,Type,state,{plane=0,stacked=false}={}){
  if(source instanceof Type){if(source.length!==(stacked?3:1)*state.n)fail('INVALID_INPUT','Native numeric array dimensions differ');return {source,Type,offset:stacked?plane*state.n:0};}
  const d=source?.descriptor??source;if(!source||typeof source.readInto!=='function'&&typeof source.readWindow!=='function'||source.byteLength!==undefined&&source.byteLength!==state.n*4||d.width!==undefined&&d.width!==state.width||d.height!==undefined&&d.height!==state.height)fail('HISTOGRAM_NATIVE_UNAVAILABLE','Complete native numeric rows are unavailable');return {source,Type,offset:0};
 }
 function planeField(state){const planes=state.d.energy_planes;return field(Array.isArray(planes)?planes[state.qualityIndex]:planes,Float32Array,state,{plane:state.qualityIndex,stacked:!Array.isArray(planes)});}
 async function numeric(f,rect,state,signal){
  check(signal);const count=rect.width*rect.height,offset=rect.y*state.width+rect.x;
  if(f.source instanceof f.Type){if(rect.height===1||rect.width===state.width)return {data:f.source.subarray(f.offset+offset,f.offset+offset+count),release(){}};const data=new f.Type(count);for(let y=0;y<rect.height;y++){const at=f.offset+offset+y*state.width;data.set(f.source.subarray(at,at+rect.width),y*rect.width);}return {data,release(){}};}
  if(typeof f.source.readInto==='function'){const data=new f.Type(count);if(rect.height===1||rect.width===state.width)await f.source.readInto(new Uint8Array(data.buffer),offset*4,{signal});else for(let y=0;y<rect.height;y++){check(signal);await f.source.readInto(new Uint8Array(data.buffer,y*rect.width*4,rect.width*4),(offset+y*state.width)*4,{signal});}check(signal);return {data,release(){}};}
  const lease=await f.source.readWindow(rect,{signal});try{check(signal);const p=lease.plane??lease.pixels??lease;if(p.width!==rect.width||p.height!==rect.height||!(p.data instanceof f.Type)||p.data.length!==count)fail('INVALID_INPUT','Native numeric window dimensions or dtype differ');return {data:p.data,release:()=>lease.release?.()};}catch(error){await lease.release?.();throw error;}
 }
 async function originals(state,rect,signal){
  if(typeof readOriginal!=='function')fail('HISTOGRAM_REFERENCE_UNAVAILABLE','Original RGB rows are required for exact reference-panel samples');
  const lease=await readOriginal(state.analysis,rect,signal);try{check(signal);const p=lease?.pixels??lease;if(p?.width!==rect.width||p.height!==rect.height||!(p.data instanceof Uint8Array)||p.data.length!==rect.width*rect.height*3)fail('INVALID_INPUT','Original reference RGB window differs');return {data:p.data,release:()=>lease.release?.()};}catch(error){await lease?.release?.();throw error;}
 }
 async function windows(state,bbox,signal,visit){
  const [x0,y0,x1,y1]=bbox,width=x1-x0;
  // When a native row exceeds the bound, read contiguous pieces of that row.
  // Otherwise whole bounded bands can be borrowed without gathering a frame.
  const bandWidth=Math.min(width,capacity),rows=Math.min(32,Math.max(1,Math.floor(capacity/bandWidth)));
  let lastYield=performance.now();for(let y=y0;y<y1;y+=rows)for(let x=x0;x<x1;x+=bandWidth){check(signal);await visit({x,y,width:Math.min(bandWidth,x1-x),height:Math.min(rows,y1-y)});if(performance.now()-lastYield>=8){await pause();lastYield=performance.now();}check(signal);}
 }
 async function reads(fields,rect,state,signal,visit){const leases=[];try{for(const f of fields)leases.push(await numeric(f,rect,state,signal));check(signal);await visit(leases.map(l=>l.data));}finally{for(const lease of leases.reverse())await lease.release();}}
 async function computeScores(state,signal){
  const fields=[field(state.d.energy_scope,Int32Array,state),field(state.d.energy_low_score,Float32Array,state),field(state.d.energy_high_score,Float32Array,state)],counts=new Uint32Array(bins),panelCounts=new Map(state.panels.map(p=>[p.id,0]));let count=0,zeroCount=0,scopeZeroCount=0,scopeNegativeCount=0,unknownPanelPixels=0,minimum=Infinity,maximum=-Infinity;
  const bbox=[0,0,state.width,state.height];
  await windows(state,bbox,signal,rect=>reads(fields,rect,state,signal,([scope,low,high])=>{for(let i=0;i<scope.length;i++){
   if(!Number.isFinite(low[i])||low[i]<0||!Number.isFinite(high[i])||high[i]<0)fail('INVALID_INPUT','Invalid native energy score');
   if(scope[i]===0){scopeZeroCount++;continue;}if(scope[i]<0){scopeNegativeCount++;continue;}
   if(panelCounts.has(scope[i]))panelCounts.set(scope[i],panelCounts.get(scope[i])+1);else unknownPanelPixels++;
   if(state.panelId!==null&&scope[i]!==state.panelId)continue;const value=high[i]-low[i];count++;zeroCount+=value===0?1:0;minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);
  }}));
  if(!count)minimum=maximum=0;const maximumMagnitude=Math.max(Math.abs(minimum),Math.abs(maximum)),bounds=maximumMagnitude?[-maximumMagnitude,maximumMagnitude]:[-.5,.5];
  await windows(state,bbox,signal,rect=>reads(fields,rect,state,signal,([scope,low,high])=>{for(let i=0;i<scope.length;i++)if(scope[i]>0&&(state.panelId===null||scope[i]===state.panelId))counts[midpointBin(high[i]-low[i],bounds,bins)]++;}));
  return {counts,edges:edges(bounds),bounds,count,zeroCount,observed:{minimum,maximum},maximumMagnitude,degenerate:maximumMagnitude===0,scopeZeroCount,scopeNegativeCount,unknownPanelPixels,panelCounts};
 }
 async function computeReference(state,signal){
  const f=planeField(state),counts=new Uint32Array(bins);let count=0,invalidGrayCount=0,zeroCount=0,minimum=Infinity,maximum=-Infinity;
  const visit=async consume=>windows(state,state.panel.bbox,signal,async rect=>{const a=await numeric(f,rect,state,signal);let b;try{b=await originals(state,rect,signal);for(let i=0;i<a.data.length;i++){const value=a.data[i];if(!Number.isFinite(value)||value<0||value>255)fail('INVALID_INPUT','Invalid native residual-energy value');const at=3*i,g=gray(b.data[at],b.data[at+1],b.data[at+2]);consume(value,g>3&&g<252);}}finally{await b?.release();await a.release();}});
  await visit((value,valid)=>{if(!valid){invalidGrayCount++;return;}count++;zeroCount+=value===0?1:0;minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);});
  if(!count)minimum=maximum=0;
  // This is an adaptive plotting domain in the original residual-energy units,
  // not a rescaling of native values. A mostly idempotent JPEG can legitimately
  // have every residual below1; the full RGB8 bound would collapse its curve.
  const bounds=[0,maximum>0?maximum:1];
  await visit((value,valid)=>{if(valid)counts[midpointBin(value,bounds,bins)]++;});
  return {counts,edges:edges(bounds),bounds,count,zeroCount,invalidGrayCount,observed:{minimum,maximum},passes:2,axisSource:'observed-native-residual-maximum',degenerate:maximum===0};
 }
 async function cached(kind,key,compute,signal,metadataBytes=0){
  const current=kind==='scores'?scoreCache:referenceCache;if(current?.key===key)return current.value;
  const countLease=await reserve(histogramBytes+metadataBytes);let readerLease,failure,success=false;
  try{readerLease=await reserve(maximumWindowBytes);const value=await compute();check(signal);const next={key,value,lease:countLease};if(kind==='scores'){scoreCache=next;}else referenceCache=next;success=true;await release(current?.lease);return value;}
  catch(error){failure=error;throw error;}finally{try{await release(readerLease);}catch(error){if(!failure)throw error;}if(!success)await release(countLease);}
 }
 async function build(state,signal){
  const {d,e,analysis,panel,sourceSha256}=state,scoreKey=JSON.stringify([analysis.id,sourceSha256,state.width,state.height,state.quality,e.quantiles,state.panelId,token(d.energy_scope),token(d.energy_low_score),token(d.energy_high_score)]),scores=await cached('scores',scoreKey,()=>computeScores(state,signal),signal,state.panels.length*1024);check(signal);
  let reference={available:false,reason:'No native reference panel is available',count:0,unit:'RGB8 weighted absolute JPEG residual, averaged over native7×7 windows',statistic:'quality-plane-residual-energy'};
  if(panel){const f=planeField(state),referenceKey=JSON.stringify([sourceSha256,state.width,state.height,state.quality,state.qualities,state.qualityIndex,panel.id,panel.bbox,token(f.source),f.offset]),raw=await cached('reference',referenceKey,()=>computeReference(state,signal),signal),probe={...panel.probes[state.qualityIndex]};reference={...reference,...raw,available:true,reason:null,panelId:panel.id,qualityIndex:state.qualityIndex,quality:state.qualities[state.qualityIndex]??null,bbox:[...panel.bbox],quantiles:[...e.quantiles],probe,cuts:[{kind:'low',value:probe.q10,quantile:e.quantiles[0]},{kind:'high',value:probe.q90,quantile:e.quantiles[1]}],sampleRule:'native panel bbox and3<gray(originalRGB)<252; independent of final energy_scope ownership',native:true};}
  check(signal);const energy={quantiles:[...e.quantiles],thresholds:[...e.thresholds],profile:e.profile??null,energy_floor:e.energy_floor??.25,log_scale:e.log_scale??.2};
  return {schema:'sherloq.energy-histogram/1',source:{resultId:analysis.id,imageId:analysis.imageId??null,sourceSha256,width:state.width,height:state.height,quality:state.quality,qualities:[...state.qualities],native:true},selection:{referencePanelId:panel?.id??null,qualityIndex:state.qualityIndex},panels:state.panels.map(p=>({id:p.id,bbox:[...p.bbox],count:scores.panelCounts.get(p.id)??0,probes:p.probes.map(probe=>({...probe}))})),reference,scores:{counts:scores.counts,edges:scores.edges,bounds:[...scores.bounds],count:scores.count,zeroCount:scores.zeroCount,observed:{...scores.observed},maximumMagnitude:scores.maximumMagnitude,degenerate:scores.degenerate,scopeZeroCount:scores.scopeZeroCount,scopeNegativeCount:scores.scopeNegativeCount,unknownPanelPixels:scores.unknownPanelPixels,panelId:state.panelId,unit:'native signed logarithmic contrast /0.2',statistic:'energy_high_score-energy_low_score',qualityConfirmation:'median of three native signed quality-plane scores, then positive clipping',referenceScope:'energy_scope>0',zeroIncluded:true,native:true,markers:[{kind:'low',value:-e.thresholds[0],weakValue:-e.thresholds[0]/2},{kind:'high',value:e.thresholds[1],weakValue:e.thresholds[1]/2}]},metadata:{quality:state.quality,qualities:[...state.qualities],energy,probability:false,native:true,quantileReference:'separate quality-plane distributions in each original reference-panel bbox; no global residual percentile marker',passes:{scores:2,reference:panel?2:0},reference:{passes:panel?2:0,axisSource:'observed-native-residual-maximum'},windowByteLimit:maximumWindowBytes}};
 }
 const invalidate=async()=>{version++;active?.controller.abort();if(active)await active.promise.catch(()=>{});const previous=[scoreCache,referenceCache];scoreCache=referenceCache=null;for(const entry of previous)await release(entry?.lease);};
 return {
  async get(analysis,options={}){
   check(options.signal);const state=validate(analysis,options),generation=++version;active?.controller.abort();if(active)await active.promise.catch(()=>{});if(generation!==version)fail('CANCELLED','Energy histogram superseded');check(options.signal);if(disposed)fail('DISPOSED','Energy histogram owner disposed');
   const controller=new AbortController(),abort=()=>controller.abort(options.signal.reason);options.signal?.addEventListener('abort',abort,{once:true});const job={controller};active=job;
   job.promise=build(state,controller.signal).finally(()=>{options.signal?.removeEventListener('abort',abort);if(active===job)active=null;});return job.promise;
  },
  invalidate,
  async dispose(){if(disposed)return;disposed=true;await invalidate();}
 };
}
