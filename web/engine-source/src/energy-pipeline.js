// Full energy-only scientific path under qualification. Legacy peer biomes are separate.
import{parameters}from'./pixel-utils.js';import{requireValue,checkAbort}from'./errors.js';import{jpegHeader}from'./image-headers.js';import{tableEstimate}from'./jpeg-quality.js';
import{energyLogData}from'./energy-log-data.js';import{referenceLogFunction}from'./energy-log-reference.js';
import{describeEnergy}from'./energy-primitives.js';import{prepareEnergy}from'./energy-prepare.js';import{segmentEnergy,energyColor}from'./energy-segment.js';import{estimateEnergy,energyDeviations,energyProfile}from'./energy-auto.js';
import{detectPanels}from'./auto-zones.js';
export function energyParams(input={}){
 const p=parameters(input,{quality:0,block:32,minimum:3,profile:'standard',histogramLow:10,histogramHigh:990,shadow:50,highlight:50},{quality:[0,100],block:[16,96],minimum:[1,1000],histogramLow:[0,500],histogramHigh:[500,1000],shadow:[0,200],highlight:[0,200]},{profile:['standard','manual','sensitive','conservative']});requireValue([16,32,64,96].includes(p.block),'Unsupported native energy cell size');
 const controls={histogramLow:10,histogramHigh:990,shadow:50,highlight:50};if(p.profile!=='manual')for(const [key,value]of Object.entries(controls))requireValue(!Object.hasOwn(input,key)||input[key]===value,'Explicit energy controls require the manual profile');return p;
}
export function energyReferenceHeader(header,requested){
 if(requested)return {quality:requested,quality_origin:'manual',table_deviation:null};
 if(header?.quantization&&Array.isArray(header.components)&&Object.values(header.quantization).every(t=>t.every(x=>x>0))){const estimate=tableEstimate(header.quantization,header.components);if(estimate){let closest=0;for(let q=1;q<=100;q++)if(estimate.distance[q]<estimate.distance[closest])closest=q;return {quality:Math.max(1,closest),quality_origin:'jpeg_tables',table_deviation:estimate.deviation};}}
 return {quality:75,quality_origin:'fallback_no_usable_jpeg_tables',table_deviation:null};
}
export function energyReferenceQuality(bytes,requested){
 if(!requested&&bytes?.[0]===255&&bytes[1]===216){try{return energyReferenceHeader(jpegHeader(bytes),requested);}catch{/* Native no-usable-table fallback. */}}
 return energyReferenceHeader(null,requested);
}
export async function energyPipeline(image,p,hooks={},context={}){
 const {width,height}=image,n=width*height,account=context.reserveMemory??(()=>{}),memo=context.memo??(async(_name,compute)=>compute()),log=context.energyLog??(()=>{account(512*1024);return referenceLogFunction({minimumBits:973078528,maximumBits:1157627904},new Uint8Array(energyLogData().buffer));})();
 requireValue(typeof log==='function'&&context.codec?.recompress,'Qualified log and JPEG codec required');let block=p.block;while(Math.floor(height/block)*Math.floor(width/block)>16384)block+=8;requireValue(Math.floor(height/block)*Math.floor(width/block)>=25,'Image too small for25 complete native cells');
 // Pin live scientific arrays independently of cache entries, which may be evicted.
 account(28*n);
 const quality=energyReferenceQuality(context.bytes,p.quality),q=quality.quality,levels=q<=5?[q,q+5,q+10]:q>=96?[q-10,q-5,q]:[q-5,q,q+5],metrics={workers:1,kernel:'ela-energy-reference',energyRecompressions:0,energyCodecMs:0,energyPrimitivesMs:0,energyPreparationMs:0,energyProfileMs:0,energySegmentationMs:0};
 async function workspace(compute){const releases=[];try{return await compute(bytes=>{const release=account(bytes);if(typeof release==='function')releases.push(release);});}finally{for(const release of releases)release();}}
 const planes=await memo('energy-planes/'+q,async()=>{
  const names=levels.map(level=>'energy-plane/'+level),compute=missing=>workspace(async reserve=>{
   reserve(n*40+32*1024**2);const qualities=missing.map(name=>Number(name.split('/').at(-1)));
   if(context.qualityPool&&n>=1048576&&qualities.length>1){const pooled=await context.qualityPool.run(image,{signal:hooks.signal,onProgress:f=>hooks.onProgress?.(.3*f)},{mode:'energy',qualities});metrics.workers=pooled.workers;metrics.kernel='ela-energy-pool';metrics.energyRecompressions=qualities.length;metrics.energyPoolMs=pooled.kernelMs;metrics.energyScheduling=pooled.scheduling;return pooled.values.map(row=>row[1]);}
   const values=[];for(const level of qualities){checkAbort(hooks.signal);const start=performance.now(),decoded=await context.codec.recompress(image,level,{signal:hooks.signal});metrics.energyRecompressions++;metrics.energyCodecMs+=performance.now()-start;requireValue(decoded.width===width&&decoded.height===height&&decoded.format==='rgb8','JPEG recompression changed dimensions');const prepared=performance.now(),result=await describeEnergy(image,decoded,{signal:hooks.signal,account:reserve});metrics.energyPrimitivesMs+=performance.now()-prepared;values.push(result.energy);hooks.onProgress?.(.3*values.length/qualities.length);}return values;
  });
  let values;if(context.memoMany)values=await context.memoMany(names,compute);else{values=[];for(const name of names)values.push(await memo(name,async()=>(await compute([name]))[0]));}
  account(12*n);const combined=new Float32Array(3*n);for(let i=0;i<3;i++)combined.set(values[i],i*n);return combined;
 });
 // Geometry depends only on decoded pixels, not JPEG quality or histogram bounds.
 metrics.energyPanelDetections=0;
 const panelDetector=()=>memo('energy-panels',()=>workspace(async reserve=>{metrics.energyPanelDetections++;return detectPanels(image,{signal:hooks.signal,account:reserve});}));
 const prepare=quantiles=>memo('energy-scores/'+q+'/'+quantiles.join('/'),()=>workspace(async reserve=>{const start=performance.now();try{return await prepareEnergy(image,planes,quantiles,log,{signal:hooks.signal,account:reserve,panelDetector});}finally{metrics.energyPreparationMs+=performance.now()-start;}}));
 let profile,prepared;
 if(p.profile==='sensitive'||p.profile==='conservative'){
  const automatic=await memo('energy-auto/'+q,async()=>{const reference=await prepare([.1,.9]),start=performance.now();const estimate=await workspace(reserve=>{reserve(reference.energy_summary.length*4096);return estimateEnergy({...reference,energy_planes:planes},log,{signal:hooks.signal,account:reserve});});metrics.energyProfileMs+=performance.now()-start;const proposal=await prepare(estimate.quantiles),t=performance.now(),thresholds=await workspace(reserve=>energyDeviations(proposal,{signal:hooks.signal,account:reserve}));metrics.energyProfileMs+=performance.now()-t;return{...estimate,thresholds};});profile=energyProfile(automatic,p.profile);prepared=await prepare(profile.quantiles);
 }else{profile=p.profile==='standard'?energyProfile(null,'standard'):{profile:'manual',quantiles:[p.histogramLow/1000,p.histogramHigh/1000],thresholds:[p.shadow/10,p.highlight/10],automatic:false};prepared=await prepare(profile.quantiles);}
 account(prepared.energy_summary.length*4096);
 const start=performance.now(),segmented=await workspace(reserve=>segmentEnergy({width,height,...prepared,metadata:{block}},{thresholds:profile.thresholds,minimum:p.minimum},{signal:hooks.signal,account:reserve}));metrics.energySegmentationMs=performance.now()-start;checkAbort(hooks.signal);
 const data={width,height,energy_planes:planes,...prepared,energy_labels:segmented.labels,regions:segmented.regions,regionColors:segmented.regions.map(r=>({id:r.id,rgb:energyColor(r)})),metadata:{method:'ela_energy',version:1,...quality,qualities:levels,requested_block:p.block,block,image_shape:[height,width],valid_shape:[Math.floor(height/block)*block,Math.floor(width/block)*block],regions:segmented.regions,energy:{enabled:true,kind:'descriptive_energy_contrast',probability:false,reference:'per_detected_panel_trimmed_mean',quantiles:profile.quantiles,thresholds:profile.thresholds,profile:p.profile,automatic:profile.automatic===false?null:profile,panels:prepared.energy_summary,window:7,log_scale:.2,energy_floor:.25,quality_confirmation:'median',segmentation:'pixel_hysteresis_half_threshold',grouping:'reference_panel_and_energy_class',minimum_strong_pixels:block*block}}};
 return{data,engineMetrics:metrics,layers:[{id:'energy-low',kind:'scalar',field:'data.energy_low_score',origin:[0,0],width,height},{id:'energy-high',kind:'scalar',field:'data.energy_high_score',origin:[0,0],width,height},{id:'energy-regions',kind:'labels',field:'data.energy_labels',origin:[0,0],width,height}],semantics:'Descriptive low/high JPEG residual energy relative to each detected panel. Scores are not probabilities or attribution of editing. Exact pixel support may be disconnected. Legacy peer biomes, background and Ghost corroboration are separate operations.'};
}
