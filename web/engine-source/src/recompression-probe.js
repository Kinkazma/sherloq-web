import {validateRecompressionOptions,resolveRecompressionPlan,deriveRecompressionPlan,recompressionFormat,recompressionPaletteColors} from './recompression-plan.js';
import {createRgbRecompression} from './jpeg-rgb-stream.js';
import {recompressSurface,recompressPixels} from './recompression-surface.js';
import {contiguousSurface} from './image-sources.js';
import {rolledRgbSurface} from './rolled-rgb-surface.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {gray} from './pixel-utils.js';
import {requireValue,checkAbort,EngineError} from './errors.js';
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export const isExperimentalRecompression=params=>params?.recompression!==undefined&&params.recompression.codec!=='jpeg';
export function selectionIdentity(params={}){const cfg=validateRecompressionOptions(params.recompression);return cfg?JSON.stringify([cfg.codec,cfg.lossless,cfg.quality??null,cfg.paletteColors??null,params.quality??null]):'historical-jpeg';}
export function selectedProbeParams(params={},quality=75,{paletteAxis='relative'}={}){
 requireValue(['relative','sweep','fixed'].includes(paletteAxis),'Unknown selected-codec probe axis.');requireValue(Number.isInteger(quality)&&quality>=0&&quality<=100,'Probe quality must be0–100.');
 const cfg=validateRecompressionOptions(params.recompression),q=Math.max(1,quality);if(!cfg)return{...params,quality:q};
 const baseQ=params.quality||cfg.quality||75,format=recompressionFormat(cfg.codec),palette=!cfg.lossless&&(cfg.paletteColors!==undefined||format?.qualityKind==='palette-colors'),next={...cfg};
 if(paletteAxis==='sweep')delete next.paletteColors;
 else if(palette){const baseN=cfg.paletteColors??recompressionPaletteColors(baseQ);next.paletteColors=paletteAxis==='fixed'?baseN:clamp(baseN+Math.round((q-baseQ)*254/99),2,256);}
 const selectedQuality=paletteAxis==='fixed'?(params.quality||cfg.quality||q):q;
 return{...params,quality:selectedQuality,recompression:next};
}
export async function resolveSelectedPlan(params,image,{quality=params?.quality||params?.recompression?.quality||75,paletteAxis='relative',signal}={}){
 const normalized={...params,quality:params?.quality||params?.recompression?.quality||75},base=await resolveRecompressionPlan(normalized,image,{signal});return selectedPlanFromBase(params,base,{quality,paletteAxis,signal});
}
export function selectedPlanFromBase(params,base,{quality=params?.quality||params?.recompression?.quality||75,paletteAxis='relative',signal}={}){
 checkAbort(signal);if(base.stage.codec==='jpeg'&&!base.stage.lossless)return null;
 const selected={...params,recompression:{...params.recompression,codec:base.stage.codec}},plan=deriveRecompressionPlan(selectedProbeParams(selected,quality,{paletteAxis}),base,{signal});return{...plan,sourceMode:base.sourceMode,selection:base.selection};
}
export function createSelectedPlanResolver(image,params={}, {paletteAxis='relative',resolvedPlan}={}){
 const captured=structuredClone(params),defaultQuality=captured.quality||captured.recompression?.quality||75;let basePlan=resolvedPlan,basePromise;
 return{
  get basePlan(){return basePlan;},
  async resolve(quality=defaultQuality,{signal}={}){
   checkAbort(signal);
   if(!basePlan){
    if(!basePromise)basePromise=resolveRecompressionPlan({...captured,quality:defaultQuality},image,{signal}).then(value=>(basePlan=value),error=>{basePromise=null;throw error;});
    await basePromise;
   }
   return selectedPlanFromBase(captured,basePlan,{quality,paletteAxis,signal});
  }
 };
}
// One global codec invocation per effective plan and circular phase. Completed
// decoded surfaces are an optional two-entry cache, never independent tiles.
export function createSelectedRgbRecompression(image,params={}, {budget,paletteAxis='relative',codecLane=0,exactCapacity=false,resolvedPlan}={}){
 requireValue(budget,'Shared selected-codec budget required.');const captured=structuredClone(params),source=image.surface??contiguousSurface(image.pixels,budget),original={...image,surface:source},plans=createSelectedPlanResolver(original,captured,{paletteAxis,resolvedPlan}),entries=new Map(),retiring=new Set(),knownPlans=new Map();
 let closed=false,closing,native,active=0;
 const requested=(q,h={})=>JSON.stringify([Math.max(1,q),h.phaseX??0,h.phaseY??0,h.sampling??'420']);
 const phase=(h={})=>{const x=h.phaseX??0,y=h.phaseY??0;requireValue([x,y].every(v=>Number.isInteger(v)&&v>=0&&v<=7),'Invalid selected-codec circular phase.');return[x,y];};
 const keyFor=(plan,h)=>JSON.stringify([plan.identity,...phase(h)]);
 async function retire(entry){if(entry.pins)return;retiring.add(entry);await entry.result.dispose();retiring.delete(entry);}
 async function drain(){for(const entry of [...retiring])await retire(entry);}
 const unregister=budget.registerAsyncReclaimer?.(async({all=false,shortfallBytes=0,signal}={})=>{const before=budget.total();await drain();for(const[key,entry]of [...entries]){if(entry.pins)continue;if(!all&&budget.total()+shortfallBytes<=budget.limit)break;checkAbort(signal);entries.delete(key);await retire(entry);}return Math.max(0,before-budget.total());},{allocationKind:'array-buffer',owner:'recompression-probe',label:'idle-selected-codec-probes'});
 return{
  selectedRecompression:true,codecLane,identity:selectionIdentity(captured),paletteAxis,
  async visit(quality,{signal,onProgress,onBand,skipBands=false,...hooks}={}){
   requireValue(!closed&&typeof onBand==='function','A live selected-codec probe and band consumer are required.');if(active)throw new EngineError('BUSY','A selected-codec probe already owns this source.');requireValue(Number.isInteger(quality)&&quality>=0&&quality<=100,'Probe quality must be0–100.');phase(hooks);checkAbort(signal);active++;
   let entry,key;
   try{await drain();const plan=await plans.resolve(quality,{signal});
    if(!plan){native??=createRgbRecompression(original,budget);return await native.visit(selectedProbeParams(captured,quality,{paletteAxis}).quality,{...hooks,signal,onProgress,onBand});}
    key=keyFor(plan,hooks);knownPlans.set(requested(quality,hooks),key);while(knownPlans.size>128)knownPlans.delete(knownPlans.keys().next().value);entry=entries.get(key);const hit=!!entry;
    if(!entry){while(entries.size>=2){const oldest=[...entries].find(([,value])=>!value.pins);if(!oldest)break;entries.delete(oldest[0]);await retire(oldest[1]);}
     const [phaseX,phaseY]=phase(hooks),surface=phaseX||phaseY?rolledRgbSurface(source,phaseX,phaseY,budget):source;
     let result;try{result=await recompressSurface({...original,surface},plan,{budget,signal,onProgress,codecLane,exactCapacity});checkAbort(signal);entry={plan,result,pins:0};entries.set(key,entry);}catch(error){await result?.dispose();throw error;}
    }else{entries.delete(key);entries.set(key,entry);}
    entry.pins++;const [phaseX,phaseY]=phase(hooks),input=phaseX||phaseY?rolledRgbSurface(source,phaseX,phaseY,budget):source,{width,height}=source.descriptor;let bands=0;
    for(let y=0;!skipBands&&y<height;y+=32){checkAbort(signal);const rows=Math.min(32,height-y),rect={x:0,y,width,height:rows};let a,b,failed=false,primary;try{a=await input.readWindow(rect,{signal});b=await entry.result.surface.readWindow(rect,{signal});await onBand(a.pixels.data,b.pixels.data,{y,rows});}catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([()=>a?.release(),()=>b?.release()],failed?{primary}:{});}bands++;onProgress?.({phase:'selected-codec-render',fraction:(y+rows)/height});}
    return{...entry.result.metrics,backend:'cpu',kernel:'selected-codec-global-rgb',experimentalRecompression:true,recompressions:hit?0:1,recompressedCache:hit,cacheEntries:entries.size,rowsPerChunk:32,bands,sourcePasses:(hit?0:plan.stage.lossless?2:1)+(skipBands?0:1),sampling:entry.result.provenance.chroma??'444',requestedJpegSampling:hooks.sampling??'420',phaseX,phaseY,recompressionPlan:entry.plan,codecProvenance:entry.result.provenance,probeAxis:paletteAxis,cold:!hit&&entry.result.metrics.cold===true,setupMilliseconds:hit?0:entry.result.metrics.setupMilliseconds??0};
   }finally{if(entry)entry.pins--;active--;}
  },
  prepare(quality,hooks={}){return this.visit(quality,{...hooks,skipBands:true,onBand:()=>{}});},
  hasEncoded(quality,hooks={}){
   if(native&&(!captured.recompression||captured.recompression.codec==='jpeg'||plans.basePlan?.stage.codec==='jpeg'))return native.hasEncoded(selectedProbeParams(captured,quality,{paletteAxis}).quality,hooks);
   const known=knownPlans.get(requested(quality,hooks));if(known&&entries.has(known))return true;
   if(plans.basePlan&&recompressionFormat(plans.basePlan.stage.codec)?.qualityMeaningful===false){const [x,y]=phase(hooks);return[...entries].some(([key])=>key===JSON.stringify([plans.basePlan.identity,x,y]));}
   return false;
  },
  async dispose(){if(closing)return closing;requireValue(active===0,'Selected-codec probes must finish before disposal.');closed=true;closing=(async()=>{for(const entry of entries.values())retiring.add(entry);entries.clear();await retireCompositeOwners([()=>native?.dispose(),()=>drain(),()=>{unregister?.();},()=>!image.surface?source.dispose():undefined]);})();try{await closing;}catch(error){closing=null;throw error;}}
 };
}
export function createSelectedCodec(image,params,{budget,paletteAxis='relative'}={}){
 const plans=createSelectedPlanResolver(image,params,{paletteAxis});
 async function compress(pixels,plan,hooks){const out=await recompressPixels(pixels,plan,{...hooks,budget});try{return{...out.pixels,data:out.pixels.data.slice(),provenance:out.provenance};}finally{await out.release();}}
 return{id:'selected-rgb-codec/'+selectionIdentity(params),async recompress(pixels,quality,hooks={}){const plan=await plans.resolve(quality,hooks);if(!plan){const{jpegCodec}=await import('./jpeg.js');return jpegCodec.recompress(pixels,Math.max(1,quality),hooks);}return compress(pixels,plan,hooks);},async recompressGray(pixels,quality,hooks={}){const plan=await plans.resolve(quality,hooks);if(!plan){const{jpegCodec}=await import('./jpeg.js');return jpegCodec.recompressGray(pixels,Math.max(1,quality),hooks);}const rgb=new Uint8Array(pixels.width*pixels.height*3);for(let i=0;i<pixels.data.length;i++)rgb.fill(pixels.data[i],i*3,i*3+3);const decoded=await compress({...pixels,format:'rgb8',data:rgb},plan,hooks),data=new Uint8Array(pixels.data.length);for(let i=0;i<data.length;i++)data[i]=gray(decoded.data[i*3],decoded.data[i*3+1],decoded.data[i*3+2]);return{width:pixels.width,height:pixels.height,format:'gray8',data};}};
}
