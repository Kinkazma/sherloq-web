import {renderEnergy} from './energy-render.js?v=0.20.0';
import {EngineError,serializeEngineError} from './unified-engine/src/errors.js';

const MiB=1024**2;
const fail=(code,message)=>{throw new EngineError(code,message);};
const check=signal=>{if(signal?.aborted)fail('CANCELLED','Cancelled');};
// The temporary arrays belong only to an explicitly provisional presentation.
// The retained native analysis and its planes are read, never rewritten.
export function createEnergyParameterPreview({engine,readOriginal,dependencies={}}){
 const render=dependencies.renderEnergy??renderEnergy;
 let modules;
 async function operations(){return modules??=Promise.all([
  dependencies.energyParams?{energyParams:dependencies.energyParams}:import('./unified-engine/src/energy-pipeline.js'),
  dependencies.energyProfile?{energyProfile:dependencies.energyProfile}:import('./unified-engine/src/energy-auto.js'),
  dependencies.prepareEnergy?{prepareEnergy:dependencies.prepareEnergy}:import('./unified-engine/src/energy-prepare.js'),
  dependencies.segmentEnergy&&dependencies.energyColor?{segmentEnergy:dependencies.segmentEnergy,energyColor:dependencies.energyColor}:import('./unified-engine/src/energy-segment.js')
 ]).then(parts=>Object.assign({},...parts,dependencies));}
 let qualifiedLog=null,logLease=null,disposed=false;
 async function release(lease,failure){if(!lease)return;try{await engine.releaseExternalMemory(lease.id);}catch(error){if(!failure)throw error;failure.details={...failure.details,cleanup:serializeEngineError(error)};}}
 async function logarithm(){
  if(qualifiedLog)return qualifiedLog;logLease=await engine.reserveExternalMemory({bytes:512*1024});
  try{const {energyLogData}=dependencies.energyLogData?dependencies:await import('./unified-engine/src/energy-log-data.js'),{referenceLogFunction}=dependencies.referenceLogFunction?dependencies:await import('./unified-engine/src/energy-log-reference.js');qualifiedLog=referenceLogFunction({minimumBits:973078528,maximumBits:1157627904},new Uint8Array(energyLogData().buffer));return qualifiedLog;}
  catch(error){await release(logLease,error);logLease=null;throw error;}
 }
 return {
  async render(analysis,{params,presentation={view:'overlay',opacity:70},preview={maxWidth:320,maxHeight:320},signal}={}){
   if(disposed)fail('DISPOSED','Energy draft owner disposed.');check(signal);
   const {energyParams,energyProfile,prepareEnergy:prepare,segmentEnergy:segment,energyColor:color}=await operations();check(signal);
   const p=energyParams(params),d=analysis?.data,{width,height}=d??{},n=width*height,nativeParams=analysis?.provenance?.params;
   if(!nativeParams||p.quality!==nativeParams.quality)fail('DRAFT_BASE_MISMATCH','The requested JPEG quality has no matching retained native energy planes; finish the exact calculation first.');
   if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(n)||!(d.energy_planes instanceof Float32Array)||d.energy_planes.length!==3*n||![d.energy_low_score,d.energy_high_score].every(a=>a instanceof Float32Array&&a.length===n)||!(d.energy_scope instanceof Int32Array)||d.energy_scope.length!==n)fail('DRAFT_BASE_UNAVAILABLE','Contiguous native energy planes and reference scope are required for this provisional view.');
   const {maxWidth,maxHeight}=preview;if(![maxWidth,maxHeight].every(v=>Number.isSafeInteger(v)&&v>=1&&v<=512))fail('INVALID_INPUT','Invalid energy draft bounds.');
   let step=1;while(step<Math.max(Math.ceil(width/maxWidth),Math.ceil(height/maxHeight)))step*=2;
   const sw=Math.ceil(width/step),sh=Math.ceil(height/step),sn=sw*sh;
   let block=p.block;while(Math.floor(height/block)*Math.floor(width/block)>16384)block+=8;
   if(Math.floor(height/block)*Math.floor(width/block)<25)fail('INVALID_INPUT','Image too small for the requested native energy cells.');
   let profile;if(p.profile==='manual')profile={quantiles:[p.histogramLow/1000,p.histogramHigh/1000],thresholds:[p.shadow/10,p.highlight/10]};
   else if(p.profile==='standard')profile=energyProfile(null,'standard');
   else if(p.profile===nativeParams.profile)profile=d.metadata?.energy;
   if(!profile?.quantiles||!profile?.thresholds)fail('DRAFT_PROFILE_UNAVAILABLE','This automatic profile requires a completed exact estimate first.');
   const summaries=d.energy_summary??d.metadata?.energy?.panels;
   if(!Array.isArray(summaries))fail('DRAFT_BASE_UNAVAILABLE','Native reference panels are unavailable.');
   const panels=[],ids=new Set();for(const panel of summaries){const b=panel?.bbox;if(!Number.isSafeInteger(panel?.id)||panel.id<=0||ids.has(panel.id)||!Array.isArray(b)||b.length!==4||!b.every(Number.isSafeInteger)||b[0]<0||b[1]<0||b[2]>width||b[3]>height||b[0]>=b[2]||b[1]>=b[3])fail('INVALID_INPUT','Invalid native reference panel.');ids.add(panel.id);const bbox=[Math.ceil(b[0]/step),Math.ceil(b[1]/step),Math.ceil(b[2]/step),Math.ceil(b[3]/step)];if(bbox[0]<bbox[2]&&bbox[1]<bbox[3])panels.push({...panel,bbox});}
   const nativeQuantiles=d.metadata?.energy?.quantiles,reprepare=!Array.isArray(nativeQuantiles)||profile.quantiles.some((q,i)=>q!==nativeQuantiles[i]);
   // Preparation's45 B/sample scratch includes returned maps; segmentation's
   //18 B/sample scratch follows it. The bound also covers source, sampled native
   // planes/scope, retained maps, labels, RGB and small reference metadata.
   const lease=await engine.reserveExternalMemory({bytes:80*sn+2*MiB+8192*panels.length});let failure;
   try{
    const original=await readOriginal(analysis,{x:0,y:0,w:width,h:height,step},signal);check(signal);
    if(original?.width!==sw||original.height!==sh||original.data?.length!==3*sn)fail('INVALID_INPUT','The sampled source dimensions differ from the native plane grid.');
    const scope=new Int32Array(sn),low=new Float32Array(sn),high=new Float32Array(sn),planes=reprepare?new Float32Array(3*sn):null;
    for(let y=0;y<sh;y++){check(signal);for(let x=0;x<sw;x++){const to=y*sw+x,from=y*step*width+x*step;scope[to]=d.energy_scope[from];low[to]=d.energy_low_score[from];high[to]=d.energy_high_score[from];if(planes)for(let q=0;q<3;q++)planes[q*sn+to]=d.energy_planes[q*n+from];}}
    let prepared={energy_scope:scope,energy_low_score:low,energy_high_score:high,energy_summary:panels};
    if(reprepare&&panels.length){
     const log=await logarithm(),polygons=panels.map(({bbox:[x0,y0,x1,y1]})=>[[x0,y0],[x1-1,y0],[x1-1,y1-1],[x0,y1-1]]);
     prepared=await prepare({width:sw,height:sh,format:'rgb8',data:original.data},planes,profile.quantiles,log,{signal,panelDetector:async()=>polygons,minimumPanelSamples:1,draftSourceScope:scope,panelIds:panels.map(p=>p.id)});
    }
    // A source sample represents step² native pixels. Project only the area
    // gates, using the native block itself; scores and thresholds keep their units.
    const segmented=await segment({width:sw,height:sh,...prepared,metadata:{block}},{thresholds:profile.thresholds,minimum:p.minimum},{signal,draftSpatialScale:step});check(signal);
    const draftData={width:sw,height:sh,...prepared,energy_labels:segmented.labels,regionColors:segmented.regions.map(r=>({id:r.id,rgb:color(r)}))},frame=await render(draftData,{width:sw,height:sh,data:original.data},presentation,{signal});check(signal);
    const draft={baseResultId:analysis.id,sourceSha256:analysis.provenance.originalSha256,params:{...p},exact:false,samplingStep:step,sampleWidth:sw,sampleHeight:sh,reusedNativeJpeg:true,repreparedHistogram:reprepare,nativeBlock:block,areaScale:step*step,minimumSamples:p.minimum*block*block/(step*step),strongSamples:block*block/(step*step),nativePanelIds:panels.map(p=>p.id),referenceScope:'nearest native energy_scope; no points outside native reference panels',regionCount:segmented.regions.length};
    return{pixels:{...frame,logicalWidth:width,logicalHeight:height,preview:true},presentation:{...presentation,view:presentation.view,preview:true,nativeResolution:step===1,exact:false,method:'native-energy-plane-samples',sourceSha256:draft.sourceSha256,sampleWidth:sw,sampleHeight:sh,params:{...p}},draft};
   }catch(error){failure=error;throw error;}finally{await release(lease,failure);}
  },
  async dispose(){if(disposed)return;disposed=true;qualifiedLog=null;const lease=logLease;logLease=null;await release(lease);}
 };
}
