import {analyzeBounded} from './doctamper-bounded.js';
import {TILE,tileBoxes,METHOD,SCIENTIFIC_LIMITS} from './doctamper.js';
import {allocateOwnedTypedArray} from '../engine-source/src/allocation.js';
import {requireValue,checkAbort,createCooperator} from '../engine-source/src/errors.js';

function originalIdentity(source){
 const o=source.doctamperOriginal;
 requireValue(o&&typeof o.sourceSha256==='string'&&/^[a-f0-9]{64}$/.test(o.sourceSha256)&&[o.width,o.height].every(n=>Number.isSafeInteger(n)&&n>0),'DTD requires the unchanged Original identity and geometry.');
 requireValue(['native-original-JPEG','native-gray-Q90-working-copy'].includes(o.mode),'DTD Original preprocessing mode is not certified.');
 return o;
}
/** Native JPEG mode belongs to Original, so a small selected JPEG context is
 * not silently recompressed. Its stored categories are borrowed once, and only
 * complete admitted blocks are ever supplied to DTD. */
export function prepareDocTamperNativeContext(context,original,{categories,workingDCT,budget,scheduler}={}){
 requireValue(context.evaluable===true&&typeof context.readWindow==='function'&&[context.width,context.height].every(n=>Number.isSafeInteger(n)&&n>0),'DTD needs an evaluable native context reader.');
 const native=original.mode==='native-original-JPEG',b=context.originalBounds;
 requireValue(Array.isArray(b)&&b.length===4&&b.every(Number.isSafeInteger)&&b[0]>=0&&b[1]>=0&&b[2]===b[0]+context.width&&b[3]===b[1]+context.height&&b[2]<=original.width&&b[3]<=original.height&&b[0]%8===0&&b[1]%8===0,'DTD context lost its Original 8-pixel block phase.');
 requireValue(native?context.width>=TILE&&context.height>=TILE&&categories?.width===original.width&&categories?.height===original.height&&typeof categories?.readWindow==='function':typeof workingDCT==='function','DTD native Original mode and context preparation differ.');
 const analysisWidth=Math.floor(Math.max(TILE,context.width)/8)*8,analysisHeight=Math.floor(Math.max(TILE,context.height)/8)*8;
 const source={width:context.width,height:context.height,readWindow:context.readWindow};
 const slice=native?{quantizationTable:categories.quantizationTable,readWindow(rect,hooks){return categories.readWindow({...rect,x:rect.x+b[0],y:rect.y+b[1]},hooks);}}:null;
 return{method:METHOD,mode:'bounded',width:context.width,height:context.height,analysisWidth,analysisHeight,patches:tileBoxes(analysisWidth,analysisHeight).map(box=>({box})),source,categories:slice,workingDCT,budget,scheduler,assertAlive(){},timings_seconds:{preprocess:0},preprocessing:{source_size:[context.width,context.height],analyzed_size:[analysisWidth,analysisHeight],original_bounds:[...b],jpeg_working_copy:!native,working_jpeg_quality:native?null:90,tile_size:TILE,merge_rule:'upstream last-write overlap order, no averaging',original_preprocessing_mode:original.mode,dct_provenance:native?'native stored Original JPEG categories and luminance table, never reencoded':'native per-tile grayscale Q90 working JPEG with white minimum512 padding; not original compression traces',normalization_mean:[.485,.455,.406].map(Math.fround),normalization_std:[.229,.224,.225].map(Math.fround),source_modified:false,rescaled:false}};
}

/** One unchanged512 DTD pipeline per complete admitted native context. The
 * union map is presentation geometry only; it never becomes a model input. */
export async function runDocTamperNativeContexts(source,{runtime,asset,categoryCache,nativeCategorySource,workingDCT,budget,scheduler,signal,onProgress,threshold=.5,concurrency=1,prefetch=true}={}){
 const original=originalIdentity(source),contexts=source.doctamperNativeContexts;
 requireValue(Array.isArray(contexts)&&typeof runtime?.infer==='function'&&budget,'DTD requires certified contexts and shared native resources.');
 requireValue([source.width,source.height].every(n=>Number.isSafeInteger(n)&&n>0)&&Number.isSafeInteger(source.width*source.height),'DTD presentation dimensions must be exact.');
 let loan,scoreOwner,validOwner,complete=false,primary;const summaries=[],cooperate=createCooperator(signal);let analysed=0,inferences=0;
 try{
  if(original.mode==='native-original-JPEG'&&contexts.some(c=>c.evaluable)){
   requireValue(categoryCache&&typeof nativeCategorySource==='function'&&original.encoded,'DTD native JPEG contexts require the unchanged encoded Original.');
   const key=JSON.stringify(['DTD-original-stored-categories-v1',original.sourceSha256,original.width,original.height]);
   loan=await categoryCache.acquire(key,({signal:sharedSignal})=>nativeCategorySource(original.encoded,{width:original.width,height:original.height,budget,scheduler,getTemporarySession:source.getTemporarySession,storage:'auto',signal:sharedSignal,onProgress}),{signal});checkAbort(signal);
   const categories=loan.value;requireValue(categories.width===original.width&&categories.height===original.height&&categories.quantizationTable?.length===64&&Array.from(categories.quantizationTable).every(v=>Number.isInteger(v)&&v>=0&&v<=63),'DTD stored Original geometry or native quantization table is unsupported.');
  }
  scoreOwner=allocateOwnedTypedArray(Float32Array,source.width*source.height,{budget,owner:'doctamper-native-result',label:'native-context-foreground'});scoreOwner.data.fill(NaN);
  validOwner=allocateOwnedTypedArray(Uint8Array,source.width*source.height,{budget,owner:'doctamper-native-result',label:'native-context-validity'});
  for(let index=0;index<contexts.length;index++){
   await cooperate();const c=contexts[index];requireValue([c.x,c.y,c.width,c.height].every(Number.isSafeInteger)&&c.x>=0&&c.y>=0&&c.width>0&&c.height>0&&c.x+c.width<=source.width&&c.y+c.height<=source.height,'DTD context exceeds its presentation bounds.');
   const summary={index,originalBounds:[...c.originalBounds],nativeDimensions:[c.width,c.height],evaluable:c.evaluable===true,status:c.evaluable?'native':'not-evaluable',reason:c.reason??null};
   if(!c.evaluable){summaries.push({...summary,analysedPixels:0});continue;}
   let result;
   try{
    const prepared=prepareDocTamperNativeContext(c,original,{categories:loan?.value,workingDCT,budget,scheduler});
    result=await analyzeBounded(prepared,{runtime,asset,signal,threshold,concurrency,prefetch,onProgress:event=>onProgress?.({...event,contextIndex:index,contextCount:contexts.length})});checkAbort(signal);
    requireValue(result.width===c.width&&result.height===c.height&&result.scoreMap?.length===c.width*c.height&&result.validRegion?.length===c.width*c.height,'DTD native result differs from its context.');
    let ownedPixels=0;for(let y=0;y<c.height;y++){await cooperate();const from=y*c.width,to=(c.y+y)*source.width+c.x;for(let x=0;x<c.width;x++)if(result.validRegion[from+x]&&!validOwner.data[to+x]){scoreOwner.data[to+x]=result.scoreMap[from+x];validOwner.data[to+x]=255;ownedPixels++;}}
    analysed+=ownedPixels;inferences+=prepared.patches.length;
    summaries.push({...summary,analysedPixels:result.scores.valid_pixel_count,ownedPixels,scores:structuredClone(result.scores),preprocessing:structuredClone(result.preprocessing)});
   }finally{await result?.release();}
  }
  checkAbort(signal);const result={method:'doctamper',status:'ok',width:source.width,height:source.height,scoreMap:scoreOwner.data,validRegion:validOwner.data,global_verdict:null,nativeContexts:summaries,scores:{kind:'independent native-context local activations, not a verdict for the union',valid_pixel_count:analysed,unprocessed_pixel_count:source.width*source.height-analysed,threshold},scientific_limits:Array.from(SCIENTIFIC_LIMITS),preprocessing:{native_contexts:true,original_preprocessing_mode:original.mode,original_source_sha256:original.sourceSha256,source_modified:false,rescaled:false,merge_rule:'native last-write within each context; first context in stable Original order owns cross-context overlaps; no averaging',contexts:summaries},execution:{native_context_count:contexts.length,inference_tiles:inferences,concurrency,prefetch},semantics:'Independent DTD512 contexts retain Original stored JPEG block phase/table or the declared native grayQ90 method. Excluded RGB never enters a context. Gaps, partial selected blocks and pixels without any admitted native512 footprint have no score, not score zero.'};
  let retired=false;Object.defineProperty(result,'release',{value:()=>{if(retired)return;retired=true;scoreOwner.release();validOwner.release();}});complete=true;return result;
 }catch(error){primary=error;throw error;}finally{
  const errors=[];try{await loan?.release();}catch(error){errors.push(error);}if(!complete||errors.length){try{scoreOwner?.release();}catch(error){errors.push(error);}try{validOwner?.release();}catch(error){errors.push(error);}}
  if(errors.length){if(primary&&Object.isExtensible(primary))primary.doctamperRetirementErrors=errors.map(e=>({code:e.code,message:e.message}));else if(!primary)throw new AggregateError(errors,'DTD native context retirement failed');}
 }
}
