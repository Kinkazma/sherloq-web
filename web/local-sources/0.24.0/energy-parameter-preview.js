import {energyFieldAvailable,sampleEnergyField} from './energy-native-fields.js?v=0.24.0';
import {renderEnergy} from './energy-render.js?v=0.24.0';
import {EngineError,serializeEngineError} from './unified-engine/src/errors.js';
import {createAdaptivePreview,ADAPTIVE_PREVIEW_MAX_SIDE,ADAPTIVE_PREVIEW_MAX_PIXELS} from './adaptive-preview.js?v=0.24.0';

const MiB=1024**2;
const fail=(code,message)=>{throw new EngineError(code,message);};
const check=signal=>{if(signal?.aborted)fail('CANCELLED','Cancelled');};
// The temporary arrays belong only to an explicitly provisional presentation.
// The retained native analysis and its planes are read, never rewritten.
export function createEnergyParameterPreview({engine,readOriginal,dependencies={},adaptive=createAdaptivePreview()}={}){
 const render=dependencies.renderEnergy??renderEnergy;
 let modules,initializationMilliseconds=0;
 async function operations(){if(modules)return modules;const start=performance.now();modules=Promise.all([
  dependencies.energyParams?{energyParams:dependencies.energyParams}:import('./unified-engine/src/energy-pipeline.js'),
  import('./unified-engine/src/energy-auto.js'),
  dependencies.prepareEnergy?{prepareEnergy:dependencies.prepareEnergy}:import('./unified-engine/src/energy-prepare.js'),
  dependencies.segmentEnergy&&dependencies.energyColor?{segmentEnergy:dependencies.segmentEnergy,energyColor:dependencies.energyColor}:import('./unified-engine/src/energy-segment.js')
 ]).then(parts=>Object.assign({},...parts,dependencies));try{return await modules;}finally{initializationMilliseconds+=performance.now()-start;}}
 let qualifiedLog=null,logLease=null,codecLease=null,codecPromise=null,disposed=false,active=false,finishActive;
 const planeCache=new Map();let nativeGrid=null,referenceSerial=0;const references=new WeakMap();
 const reference=value=>{if(!value||typeof value!=='object')return null;if(!references.has(value))references.set(value,++referenceSerial);return references.get(value);};
 function nativeGridKey(analysis,width,height,step){const d=analysis.data,field=name=>{const handle=analysis.planeSurfaces?.[name]??(name==='energy_low_score'?analysis.surface:null);if(handle)return[handle.id,handle.revision,handle.width,handle.height,handle.format];const q=/^energy_plane_(\d)$/.exec(name);return reference(q?(Array.isArray(d.energy_planes)?d.energy_planes[+q[1]]:d.energy_planes):d[name]);};return JSON.stringify([analysis.id,analysis.provenance.originalSha256,analysis.sourceRegionDomain?.fingerprint??null,analysis.sourceRegionSourceSurface?.id,analysis.sourceRegionSourceSurface?.revision,reference(analysis),width,height,step,...['energy_scope','energy_low_score','energy_high_score','energy_plane_0','energy_plane_1','energy_plane_2'].map(field)]);}
 async function clearNativeGrid(){const previous=nativeGrid;nativeGrid=null;let failure;for(const lease of previous?.leases??[])try{await release(lease);}catch(error){failure??=error;}if(failure)throw failure;}
 let activeDone=Promise.resolve();
 async function release(lease,failure){if(!lease)return;try{await engine.releaseExternalMemory(lease.id);}catch(error){if(!failure)throw error;failure.details={...failure.details,cleanup:serializeEngineError(error)};}}
 async function logarithm(){
  if(qualifiedLog)return qualifiedLog;const start=performance.now();logLease=await engine.reserveExternalMemory({bytes:512*1024});
  try{const {energyLogData}=dependencies.energyLogData?dependencies:await import('./unified-engine/src/energy-log-data.js'),{referenceLogFunction}=dependencies.referenceLogFunction?dependencies:await import('./unified-engine/src/energy-log-reference.js');qualifiedLog=referenceLogFunction({minimumBits:973078528,maximumBits:1157627904},new Uint8Array(energyLogData().buffer));return qualifiedLog;}
  catch(error){await release(logLease,error);logLease=null;throw error;}finally{initializationMilliseconds+=performance.now()-start;}
 }
 async function codec(){
  if(!codecLease)codecLease=await engine.reserveExternalMemory({bytes:32*MiB});
  if(codecPromise)return codecPromise;const start=performance.now();codecPromise=dependencies.jpegCodec?Promise.resolve(dependencies.jpegCodec):import('./unified-engine/src/jpeg.js').then(m=>m.jpegCodec);try{return await codecPromise;}finally{initializationMilliseconds+=performance.now()-start;}
 }
 async function residualPlanes(original,quality,identity,signal){
  const levels=quality<=5?[quality,quality+5,quality+10]:quality>=96?[quality-10,quality-5,quality]:[quality-5,quality,quality+5],sn=original.width*original.height,planes=new Float32Array(3*sn),recompressed=[];
  const describe=dependencies.describeEnergy??(await import('./unified-engine/src/energy-primitives.js')).describeEnergy;
  for(let i=0;i<3;i++){
   check(signal);if(disposed)fail('CANCELLED','Energy draft owner disposed.');
   const key=identity+'/'+levels[i];let entry=planeCache.get(key);
   if(entry){planeCache.delete(key);planeCache.set(key,entry);}
   else{
    while(planeCache.size>=5){const [oldKey,old]=planeCache.entries().next().value;planeCache.delete(oldKey);await release(old.lease);}
    const lease=await engine.reserveExternalMemory({bytes:sn*4});let failure;
    try{
     const jpeg=await codec(),decoded=await jpeg.recompress(original,levels[i],{signal});check(signal);
     if(decoded?.width!==original.width||decoded.height!==original.height||decoded.format!=='rgb8'||!(decoded.data instanceof Uint8Array)||decoded.data.length!==3*sn)fail('INVALID_INPUT','Draft JPEG recompression changed the sampled source.');
     const described=await describe(original,decoded,{signal});check(signal);
     if(!(described?.energy instanceof Float32Array)||described.energy.length!==sn)fail('INVALID_INPUT','Invalid provisional JPEG residual plane.');
     entry={energy:described.energy,lease};planeCache.set(key,entry);recompressed.push(levels[i]);
    }catch(error){failure=error;throw error;}finally{if(!entry)await release(lease,failure);}
   }
   planes.set(entry.energy,i*sn);
  }
  return{planes,levels,recompressed};
 }
 return {
  async render(analysis,{params,presentation={view:'overlay',opacity:70},preview={},signal}={}){
   if(disposed)fail('DISPOSED','Energy draft owner disposed.');if(active)fail('BUSY','An energy draft is already running.');check(signal);
   active=true;activeDone=new Promise(resolve=>{finishActive=resolve;});const started=performance.now(),startedAt=Date.now(),initializationBefore=initializationMilliseconds;try{
   const {energyParams,energyProfile,estimateEnergy,energyDeviations,prepareEnergy:prepare,segmentEnergy:segment,energyColor:color}=await operations();check(signal);
   const p=energyParams(params),d=analysis?.data,{width,height}=d??{},n=width*height,nativeParams=analysis?.provenance?.params;
   if(!nativeParams)fail('DRAFT_BASE_UNAVAILABLE','A retained native energy analysis is required.');
   const nativeQuality=d?.metadata?.quality??(nativeParams.quality||null),quality=p.quality||nativeQuality;
   if(!Number.isInteger(quality)||quality<1||quality>100)fail('DRAFT_BASE_UNAVAILABLE','The native resolved JPEG quality is unavailable.');
   const changedQuality=quality!==nativeQuality;
   if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(n)||!['energy_scope','energy_low_score','energy_high_score','energy_plane_0','energy_plane_1','energy_plane_2'].every(name=>energyFieldAvailable(analysis,name)))fail('DRAFT_BASE_UNAVAILABLE','Complete retained native energy fields and reference scope are required for this provisional view.');
   const domain=analysis.sourceRegionDomain;if(changedQuality&&domain&&domain.countIncluded!==domain.width*domain.height)fail('SOURCE_SCOPE_PREVIEW_UNSUPPORTED','A changed-quality draft cannot recompress excluded source pixels.');
   const {maxWidth=ADAPTIVE_PREVIEW_MAX_SIDE,maxHeight=ADAPTIVE_PREVIEW_MAX_SIDE,maxPixels=ADAPTIVE_PREVIEW_MAX_PIXELS,maxWorkingBytes=128*MiB}=preview;if(![maxWidth,maxHeight].every(v=>Number.isSafeInteger(v)&&v>=1&&v<=ADAPTIVE_PREVIEW_MAX_SIDE)||!Number.isSafeInteger(maxPixels)||maxPixels<1||!Number.isSafeInteger(maxWorkingBytes)||maxWorkingBytes<0)fail('INVALID_INPUT','Invalid energy draft bounds.');
   const summaries=d.energy_summary??d.metadata?.energy?.panels;if(!Array.isArray(summaries))fail('DRAFT_BASE_UNAVAILABLE','Native reference panels are unavailable.');
   const overhead=2*MiB+8192*summaries.length+(changedQuality&&!codecLease?32*MiB:0);if(maxWorkingBytes<overhead+160)fail('MEMORY_LIMIT','The retained native result leaves no admitted energy preview workspace.');
   const admittedPixels=Math.min(maxPixels,ADAPTIVE_PREVIEW_MAX_PIXELS,Math.floor((maxWorkingBytes-overhead)/160)),costKey='ela/biomes/'+(changedQuality?'quality':'native-planes')+'/'+p.profile+'/'+presentation.view,plan=adaptive&&preview.adaptive!==false?adaptive.plan({key:costKey,width,height,maxSide:Math.min(maxWidth,maxHeight),maxPixels:admittedPixels,sampling:'power-of-two',feedback:preview.adaptiveFeedback}):null;if(plan){plan.token.startedAt=startedAt;plan.token.startedClock=started;}
   let step=plan?.step??1;if(!plan)while(step<Math.max(Math.ceil(width/maxWidth),Math.ceil(height/maxHeight))||Math.ceil(width/step)*Math.ceil(height/step)>admittedPixels)step*=2;
   const sw=Math.ceil(width/step),sh=Math.ceil(height/step),sn=sw*sh;
   let block=p.block;while(Math.floor(height/block)*Math.floor(width/block)>16384)block+=8;
   if(Math.floor(height/block)*Math.floor(width/block)<25)fail('INVALID_INPUT','Image too small for the requested native energy cells.');
   let profile;if(p.profile==='manual')profile={quantiles:[p.histogramLow/1000,p.histogramHigh/1000],thresholds:[p.shadow/10,p.highlight/10]};
   else if(p.profile==='standard')profile=energyProfile(null,'standard');
   else if(!changedQuality&&p.profile===nativeParams.profile)profile=d.metadata?.energy;
   const automatic=!profile&&(p.profile==='sensitive'||p.profile==='conservative');
   if(!automatic&&(!profile?.quantiles||!profile?.thresholds))fail('DRAFT_PROFILE_UNAVAILABLE','Energy profile parameters unavailable.');
   const panels=[],ids=new Set();for(const panel of summaries){const b=panel?.bbox;if(!Number.isSafeInteger(panel?.id)||panel.id<=0||ids.has(panel.id)||!Array.isArray(b)||b.length!==4||!b.every(Number.isSafeInteger)||b[0]<0||b[1]<0||b[2]>width||b[3]>height||b[0]>=b[2]||b[1]>=b[3])fail('INVALID_INPUT','Invalid native reference panel.');ids.add(panel.id);const bbox=[Math.ceil(b[0]/step),Math.ceil(b[1]/step),Math.ceil(b[2]/step),Math.ceil(b[3]/step)];if(bbox[0]<bbox[2]&&bbox[1]<bbox[3])panels.push({...panel,bbox});}
   const nativeQuantiles=d.metadata?.energy?.quantiles,reprepare=changedQuality||automatic||!Array.isArray(nativeQuantiles)||profile.quantiles.some((q,i)=>q!==nativeQuantiles[i]);
   // Bound source, residual primitives, successive automatic preparations and
   // segmentation scratch independently from the leased JPEG/plane cache.
   const gridIdentity=nativeGridKey(analysis,width,height,step);if(nativeGrid&&nativeGrid.key!==gridIdentity)await clearNativeGrid();check(signal);for(const[key,entry]of planeCache)if(!key.startsWith(gridIdentity+'/')){planeCache.delete(key);await release(entry.lease);}
   const cacheHit=!!nativeGrid,needsPlanes=reprepare&&!changedQuality,planesHit=!!nativeGrid?.planes,entry=nativeGrid?{...nativeGrid,leases:[...nativeGrid.leases]}:{key:gridIdentity,leases:[],bytes:0},added=[];let lease,failure,committed=false;
   try{
    // Move ownership of the sampled native inputs out of the frame workspace.
    // Total admission remains the previous128B/sample envelope: cached buffers
    // are counted once, and the rest stays available to preparation/rendering.
    const extra=(cacheHit?0:15*sn)+(needsPlanes&&!planesHit?12*sn:0);
    if(extra){const cached=await engine.reserveExternalMemory({bytes:extra});added.push(cached);entry.leases.push(cached);entry.bytes+=extra;}
    lease=await engine.reserveExternalMemory({bytes:128*sn-entry.bytes+2*MiB+8192*panels.length});check(signal);
    const grid={width:sw,height:sh,step};
    if(!cacheHit){
     const original=await readOriginal(analysis,{x:0,y:0,w:width,h:height,step},signal);check(signal);
     if(original?.width!==sw||original.height!==sh||original.data?.length!==3*sn||original.data.BYTES_PER_ELEMENT!==1)fail('INVALID_INPUT','The sampled source dimensions differ from the native plane grid.');
     entry.original=original;entry.scope=await sampleEnergyField(analysis,'energy_scope',grid,{engine,signal});entry.low=await sampleEnergyField(analysis,'energy_low_score',grid,{engine,signal});entry.high=await sampleEnergyField(analysis,'energy_high_score',grid,{engine,signal});
    }
    if(needsPlanes&&!planesHit){entry.planes=new Float32Array(3*sn);for(let q=0;q<3;q++){check(signal);entry.planes.set(await sampleEnergyField(analysis,'energy_plane_'+q,grid,{engine,signal}),q*sn);}}
    const {original,scope,low,high}=entry,sampledPlanes=needsPlanes?entry.planes:null;
    const smallOriginal={width:sw,height:sh,format:'rgb8',data:original.data},residual=changedQuality?await residualPlanes(smallOriginal,quality,gridIdentity,signal):null,planes=residual?.planes??sampledPlanes;
    let prepared={energy_scope:scope,energy_low_score:low,energy_high_score:high,energy_summary:panels};
    if(reprepare){
     const log=await logarithm(),polygons=panels.map(({bbox:[x0,y0,x1,y1]})=>[[x0,y0],[x1-1,y0],[x1-1,y1-1],[x0,y1-1]]),preparations=new Map();
     const prepareAt=async quantiles=>{
      const key=quantiles.join('/');if(preparations.has(key))return preparations.get(key);
      const result=panels.length?await prepare(smallOriginal,planes,quantiles,log,{signal,panelDetector:async()=>polygons,minimumPanelSamples:1,draftSourceScope:scope,panelIds:panels.map(p=>p.id)}):{energy_scope:scope,energy_low_score:new Float32Array(sn),energy_high_score:new Float32Array(sn),energy_summary:[]};
      preparations.set(key,result);return result;
     };
     if(automatic){
      const reference=await prepareAt([.1,.9]),estimate=await estimateEnergy({...reference,energy_planes:planes},log,{signal}),proposal=await prepareAt(estimate.quantiles),thresholds=await energyDeviations(proposal,{signal});
      profile=energyProfile({...estimate,thresholds},p.profile);
     }
     prepared=await prepareAt(profile.quantiles);
    }
    // A source sample represents step² native pixels. Project only the area
    // gates, using the native block itself; scores and thresholds keep their units.
    const segmented=await segment({width:sw,height:sh,...prepared,metadata:{block}},{thresholds:profile.thresholds,minimum:p.minimum},{signal,draftSpatialScale:step});check(signal);
    const draftData={width:sw,height:sh,...prepared,energy_labels:segmented.labels,regionColors:segmented.regions.map(r=>({id:r.id,rgb:color(r)}))},frame=await render(draftData,{width:sw,height:sh,data:original.data},presentation,{signal});check(signal);
    const draft={nativeSampleCache:{hit:cacheHit,qualityPlanesHit:needsPlanes&&planesHit,bytes:entry.bytes,sampleWidth:sw,sampleHeight:sh,sourceReads:cacheHit?0:1,numericFieldsRead:(cacheHit?0:3)+(needsPlanes&&!planesHit?3:0)},baseResultId:analysis.id,sourceSha256:analysis.provenance.originalSha256,params:{...p},exact:false,samplingStep:step,sampleWidth:sw,sampleHeight:sh,reusedNativeJpeg:!changedQuality,jpegQuality:quality,jpegQualities:residual?.levels??d.metadata?.qualities,recompressedQualities:residual?.recompressed??[],repreparedHistogram:reprepare,estimatedDraftProfile:automatic,nativeBlock:block,areaScale:step*step,minimumSamples:p.minimum*block*block/(step*step),strongSamples:block*block/(step*step),nativePanelIds:panels.map(p=>p.id),referenceScope:'nearest native energy_scope; no points outside native reference panels',regionCount:segmented.regions.length};
    if(disposed)fail('CANCELLED','Energy draft owner disposed.');
    const milliseconds=performance.now()-started,setupMilliseconds=initializationMilliseconds-initializationBefore,cold=setupMilliseconds>0,adaptiveMetrics=plan?{token:plan.token,milliseconds,setupMilliseconds,cold,pixels:sn,feedback:adaptive.observe(plan,{milliseconds,setupMilliseconds,cold,pixels:sn})}:null,metrics={schema:'energy-parameter-preview-timing/1',milliseconds,admittedPixels,adaptivePreview:adaptiveMetrics};
    nativeGrid=entry;committed=true;
    return{pixels:{...frame,logicalWidth:width,logicalHeight:height,preview:true},presentation:{...presentation,view:presentation.view,preview:true,nativeResolution:step===1,exact:false,method:changedQuality?'sampled-original-jpeg-energy':'native-energy-plane-samples',sourceSha256:draft.sourceSha256,sampleWidth:sw,sampleHeight:sh,params:{...p}},draft:{...draft,metrics},metrics};
   }catch(error){failure=error;throw error;}finally{try{await release(lease,failure);}finally{if(!committed)for(const cached of added)await release(cached,failure);}}
   }finally{active=false;finishActive();}
  },
  async dispose(){if(disposed)return;disposed=true;await activeDone;let failure;try{await clearNativeGrid();}catch(error){failure=error;}qualifiedLog=null;const leases=[logLease,codecLease,...Array.from(planeCache.values(),entry=>entry.lease)];logLease=codecLease=null;planeCache.clear();for(const lease of leases)try{await release(lease);}catch(error){failure??=error;}if(failure)throw failure;}
 };
}
