import "../runtime-context.js?v=0.21.0";
/** Exact DTD512 inference over original-resolution windows. Display products
 * are generated on demand; no full-image gray/DCT/RGBA working copies exist. */
import {TILE,METHOD,MODEL_ASSET,SCIENTIFIC_LIMITS,tileBoxes,pillowLuma,foregroundFromLogits} from './doctamper.js';
import {allocateOwnedTypedArray,allocateTypedArray,registerArrayViews} from '../unified-engine/src/allocation.js';
import {runWithResourceRecovery} from '../unified-engine/src/resource-recovery.js';
const MEAN=[.485,.455,.406].map(Math.fround),STD=[.229,.224,.225].map(Math.fround),MiB=1024**2;
const now=()=>globalThis.performance?.now()??Date.now();
function check(signal){if(signal?.aborted)throw signal.reason??new DOMException('Aborted','AbortError');}
function requireValue(value,message){if(!value)throw Error(message);}
function sourceReader(image){
 const width=image.width??image.surface?.descriptor?.width,height=image.height??image.surface?.descriptor?.height;
 requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&Number.isSafeInteger(width*height),'DTD source dimensions required.');
 if(image.surface?.readWindow)return {width,height,readWindow:(rect,options)=>image.surface.readWindow(rect,options)};
 if(typeof image.readWindow==='function')return {width,height,readWindow:(rect,options)=>image.readWindow(rect,options)};
 const channels=image.data?.length/(width*height);requireValue(channels===3||channels===4,'DTD requires RGB8/RGBA8 or an original window source.');
 return {width,height,async readWindow({x,y,width:w,height:h},{signal}={}){
  check(signal);const data=allocateTypedArray(Uint8Array,w*h*channels,{label:'DTD-source-window'});
  for(let row=0;row<h;row++)data.set(image.data.subarray(((y+row)*width+x)*channels,((y+row)*width+x+w)*channels),row*w*channels);
  return {pixels:{width:w,height:h,data},release(){}};
 }};
}
function partPixels(part){return part.pixels??part;}
function normalize(v,c){return Math.fround(Math.fround(Math.fround(v/255)-MEAN[c])/STD[c]);}
function metadata(width,height,analysisWidth,analysisHeight,workingCopy,codec){
 return {source_size:[width,height],analyzed_size:[analysisWidth,analysisHeight],jpeg_working_copy:workingCopy,working_jpeg_quality:workingCopy?90:null,
  dct_provenance:workingCopy?'Q90 working JPEG blocks encoded independently on the original 8-pixel grid; not native source traces':'native source JPEG coefficients, extracted once',
  normalization_mean:Array.from(MEAN),normalization_std:Array.from(STD),tile_size:TILE,merge_rule:'upstream last-write overlap order, no averaging',grayscale_visual:workingCopy,
  unprocessed_border_right_bottom:[Math.max(0,width-analysisWidth),Math.max(0,height-analysisHeight)],source_modified:false,rescaled:false,codec,
  memory_layout:'source windows + one512² feed per active inference; full score/validity maps only',display_products:'window rendering on demand'};
}

export async function prepareBounded(image,{signal,onProgress,budget,scheduler,getTemporarySession,storage='auto',workingDCT,nativeCategorySource}={}){
 check(signal);requireValue(!scheduler||scheduler.budget===budget,'DTD requires the shared scheduler and budget.');const started=now(),source=sourceReader(image),{width,height}=source;
 let sourceFormat=String(image.sourceFormat??image.provenance?.format??'').toUpperCase();const orientation=image.exifOrientation??image.provenance?.orientation??1,encoded=image.encodedBytes??image.source;
 if(!sourceFormat&&encoded){
  if(encoded instanceof Uint8Array)sourceFormat=encoded[0]===255&&encoded[1]===216?'JPEG':'';
  else if(typeof encoded.read==='function'){const part=await encoded.read(0,Math.min(2,encoded.byteLength),{signal});try{if(part.bytes[0]===255&&part.bytes[1]===216)sourceFormat='JPEG';}finally{part.release?.();}}
 }
 const native=sourceFormat==='JPEG'&&encoded&&orientation===1&&Math.min(width,height)>=TILE;
 requireValue(native?typeof nativeCategorySource==='function':typeof workingDCT==='function',native?'Bounded native JPEG category extractor required; recompression is not accepted.':'Bounded DTD requires the Q90 working JPEG codec.');
 const analysisWidth=Math.floor(Math.max(TILE,width)/8)*8,analysisHeight=Math.floor(Math.max(TILE,height)/8)*8;
 let categories,disposed=false;
 try{
  if(native){categories=await nativeCategorySource(encoded,{width,height,budget,scheduler,getTemporarySession,storage,signal,onProgress});check(signal);requireValue(categories.width===width&&categories.height===height,'Native JPEG category geometry mismatch.');}
  const patches=tileBoxes(analysisWidth,analysisHeight).map(box=>({box}));
  const preprocessing=metadata(width,height,analysisWidth,analysisHeight,!native,native?categories.provenance:{source:'per-tile Q90 working copies',global_equivalence:'8x8 luminance blocks on the original JPEG grid; no crop-grid shift',padding:'white to minimum512; right/bottom remainder<8 excluded as upstream'});preprocessing.tile_count=patches.length;
  return {method:METHOD,mode:'bounded',width,height,analysisWidth,analysisHeight,patches,source,categories,workingDCT,budget,scheduler,preprocessing,
   timings_seconds:{preprocess:(now()-started)/1000},
   assertAlive(){requireValue(!disposed,'DTD preparation disposed.');},
   async release(){if(disposed)return;disposed=true;await categories?.dispose();},
  };
 }catch(error){await categories?.dispose();throw error;}
}

/** One window, one exact libjpeg tile and one feed. The returned lease is held
 * through session.run; every source/category window is released on failure. */
export async function patchFeedsBounded(prepared,patch,{signal}={}){
 return runWithResourceRecovery(({resourceOperation})=>patchFeedsAttempt(prepared,patch,{signal,resourceOperation}),{budget:prepared.budget,signal,owner:'doctamper-inference',operation:'DTD-tile-preparation'});
}
async function patchFeedsAttempt(prepared,patch,{signal,resourceOperation}={}){
 prepared.assertAlive();check(signal);const {width,height,source,budget}=prepared,[x,y]=patch.box,n=TILE*TILE;
 requireValue(x%8===0&&y%8===0,'DTD working JPEG tiles must preserve the native 8x8 block phase.');
 const lease=await prepared.scheduler?.acquire({cpu:1,bytes:8*MiB,domains:{'array-buffer':8*MiB},signal,operation:resourceOperation,resourceOwner:'doctamper-inference',label:'DTD-tile-preparation'});
 let reserve,part,categoryPart,backing;let released=false;
 const release=()=>{if(released)return;released=true;backing?.();reserve?.();};
 try{
  reserve=lease?lease.retainMemory(8*MiB):budget?.reserve(8*MiB);
  const w=Math.max(0,Math.min(TILE,width-x)),h=Math.max(0,Math.min(TILE,height-y));
  requireValue(w>0&&h>0,'DTD patch does not intersect the original image.');
  part=await source.readWindow({x,y,width:w,height:h},{signal});check(signal);const pixels=partPixels(part),channels=pixels.data.length/(w*h);
  requireValue((channels===3||channels===4)&&pixels.width===w&&pixels.height===h,'Source window returned invalid RGB geometry.');
  const rgb=allocateTypedArray(Float32Array,3*n,{label:'DTD-tile-RGB'}),dct=allocateTypedArray(BigInt64Array,n,{label:'DTD-tile-DCT'}),qt=allocateTypedArray(BigInt64Array,64,{label:'DTD-tile-QT'});let table;
  if(prepared.categories){
   categoryPart=await prepared.categories.readWindow({x,y,width:TILE,height:TILE},{signal});check(signal);
   requireValue(categoryPart.data.length===n,'Native DTD category window is incomplete.');
   for(let i=0;i<n;i++)dct[i]=BigInt(categoryPart.data[i]);table=prepared.categories.quantizationTable;
   for(let row=0;row<TILE;row++)for(let col=0;col<TILE;col++){const i=row*TILE+col,j=(row*w+col)*channels;for(let c=0;c<3;c++)rgb[c*n+i]=normalize(pixels.data[j+c],c);}
  }else{
   const gray=allocateTypedArray(Uint8Array,n,{label:'DTD-tile-gray'});gray.fill(255);
   for(let row=0;row<h;row++)for(let col=0;col<w;col++){const at=(row*w+col)*channels;gray[row*TILE+col]=pillowLuma(pixels.data[at],pixels.data[at+1],pixels.data[at+2]);}
   // The source decoder window no longer needs to stay live through the codec.
   part.release?.();part=null;
   const extracted=await prepared.workingDCT({width:TILE,height:TILE,data:gray,format:'gray8'},{quality:90,grayscale:true,signal});check(signal);
   const coefficients=extracted.coefficients??extracted.coeff??extracted.data,stride=extracted.stride??TILE;
   table=extracted.quantizationTable??extracted.table??extracted.qt;
   requireValue(coefficients?.length>=stride*TILE&&stride>=TILE,'Working JPEG DCT tile is incomplete.');
   for(let row=0;row<TILE;row++)for(let col=0;col<TILE;col++){const i=row*TILE+col;dct[i]=BigInt(Math.min(20,Math.abs(coefficients[row*stride+col])));for(let c=0;c<3;c++)rgb[c*n+i]=normalize(gray[i],c);}
  }
  requireValue(table?.length===64&&Array.from(table).every(v=>Number.isInteger(v)&&v>=0&&v<=63),'DTD luminance QT outside embedding range0..63.');
  for(let i=0;i<64;i++)qt[i]=BigInt(table[i]);
  if(budget)backing=registerArrayViews(budget,{rgb,dct,qt},{owner:'doctamper-inference',label:'tile-feeds'});
  return {feeds:{rgb:{data:rgb,dims:[1,3,TILE,TILE],type:'float32'},dct:{data:dct,dims:[1,TILE,TILE],type:'int64'},qt:{data:qt,dims:[1,1,8,8],type:'int64'}},release};
 }catch(error){release();throw error;}finally{part?.release?.();categoryPart?.release?.();lease?.release();}
}
function outputArray(Type,length,budget,label){return budget?allocateOwnedTypedArray(Type,length,{budget,owner:'doctamper-result',label}):{data:allocateTypedArray(Type,length,{label}),release(){}};}

export async function analyzeBounded(prepared,{runtime,asset=MODEL_ASSET,signal,onProgress,threshold=.5,render=false,concurrency=1,prefetch=true}={}){
 prepared.assertAlive();requireValue(typeof runtime?.infer==='function','Shared runtime.infer required.');requireValue(threshold>=0&&threshold<=1,'Invalid display threshold.');check(signal);
 const started=now(),{width,height,budget}=prepared,n=width*height;let scoreOwner,validOwner,displayOwner,success=false,pendingInput;
 requireValue(Number.isInteger(concurrency)&&concurrency>=1&&concurrency<=2,'DTD supports one or two explicitly admitted tile jobs.');
 requireValue(!render||n<=16*1024**2,'Large DTD presentation must render bounded windows, not global RGBA copies.');
 let inferenceMs=0,prepareMs=0,inflightRequests=0,peakInflightRequests=0;
 try{
  await runWithResourceRecovery(()=>{let score;try{score=outputArray(Float32Array,n,budget,'foreground-score-map');const valid=outputArray(Uint8Array,n,budget,'foreground-validity');scoreOwner=score;validOwner=valid;}catch(error){score?.release();throw error;}},{budget,signal,owner:'doctamper-result',operation:'DTD-result-allocation'});scoreOwner.data.fill(NaN);
  const makeInput=async patch=>{const before=now();try{return {input:await patchFeedsBounded(prepared,patch,{signal})};}catch(error){return {error};}finally{prepareMs+=now()-before;}};
  const infer=async(input,patch)=>{let output,mapOwner,success=false;inflightRequests++;peakInflightRequests=Math.max(peakInflightRequests,inflightRequests);try{
   // Admit/allocate the small postprocess map before useful neural work. Its
   // lifetime includes out-of-order waits, and ends at ordered commit.
   const createMap=()=>outputArray(Float32Array,TILE*TILE,budget,'tile-foreground-map');
   try{mapOwner=createMap();}catch(error){let original=error;mapOwner=await runWithResourceRecovery(()=>{if(original){const failure=original;original=null;throw failure;}return createMap();},{budget,signal,owner:'doctamper-inference',operation:'DTD-tile-map-allocation'});}
   const before=now();output=await runtime.infer(asset,input.feeds,{signal,cache:false});inferenceMs+=now()-before;check(signal);foregroundFromLogits(output.logits??output.outputs?.logits,mapOwner.data);success=true;return {patch,map:mapOwner.data,release:mapOwner.release};
  }finally{inflightRequests--;output?.release?.();input.release();if(!success)mapOwner?.release();}};
  const commit=({patch,map,release})=>{try{const [x,y,x1,y1]=patch.box,w=Math.min(x1,width)-x,h=Math.min(y1,height)-y;for(let row=0;row<h;row++){scoreOwner.data.set(map.subarray(row*TILE,row*TILE+w),(y+row)*width+x);validOwner.data.fill(255,(y+row)*width+x,(y+row)*width+x+w);}}finally{release();}};

  let completed=0;
  const progress=()=>onProgress?.({method:METHOD,phase:'inference',completed,total:prepared.patches.length,memoryMode:'bounded',concurrency,prefetch:concurrency===1&&prefetch});
  if(concurrency===1){
   if(prefetch)pendingInput=makeInput(prepared.patches[0]);
   for(let i=0;i<prepared.patches.length;i++){
    check(signal);const patch=prepared.patches[i],state=await(pendingInput??makeInput(patch));pendingInput=undefined;
    if(state.error)throw state.error;
    // Preparing one successor hides decoder/codec latency under useful GPU
    // work, without creating another model/session or unbounded feed queue.
    if(prefetch&&i+1<prepared.patches.length)pendingInput=makeInput(prepared.patches[i+1]);
    commit(await infer(state.input,patch));completed++;progress();
   }
  }else{
   // Batches retain at most two maps and commit in the authors' exact order.
   // An unconstrained out-of-order queue could otherwise grow to image size.
   for(let i=0;i<prepared.patches.length;i+=concurrency){
    check(signal);const patches=prepared.patches.slice(i,i+concurrency);
    const settled=await Promise.allSettled(patches.map(async patch=>{const state=await makeInput(patch);if(state.error)throw state.error;return infer(state.input,patch);}));
    const failed=settled.find(item=>item.status==='rejected');if(failed){for(const item of settled)if(item.status==='fulfilled')item.value.release();throw failed.reason;}
    try{for(const item of settled){commit(item.value);completed++;progress();}}finally{for(const item of settled)if(item.status==='fulfilled')item.value.release();}
   }
  }
  const post=now();let count=0,positive=0,sum=0,minimum=Infinity,maximum=-Infinity;
  for(let y=0;y<height;y++){
   if(y%128===0){check(signal);await new Promise(resolve=>setTimeout(resolve,0));}
   for(let x=0;x<width;x++){const i=y*width+x;if(!validOwner.data[i])continue;const value=scoreOwner.data[i];requireValue(Number.isFinite(value),'Nonfinite processed DTD pixel.');count++;sum+=value;minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);if(value>=threshold)positive++;}
  }
  requireValue(count>0,'No DTD pixels processed.');
  const result={method:METHOD,status:'ok',width,height,scoreMap:scoreOwner.data,validRegion:validOwner.data,global_verdict:null,
   scores:{kind:'descriptive local activations, not global probability',minimum,mean:sum/count,maximum,fraction_valid_pixels_at_or_above_threshold:positive/count,threshold,valid_pixel_count:count,unprocessed_pixel_count:n-count},
   execution:{requested_tile_concurrency:concurrency,peak_inflight_tile_requests:peakInflightRequests,prefetch_tiles_limit:concurrency===1&&prefetch?1:0,inference_time_meaning:'sum of individual tile request latencies; overlapping jobs must not be interpreted as wall time'},
   preprocessing:prepared.preprocessing,scientific_limits:Array.from(SCIENTIFIC_LIMITS),asset,
   timings_seconds:{...prepared.timings_seconds,patch_preprocess:prepareMs/1000,inference:inferenceMs/1000,postprocess:(now()-post)/1000,total:(now()-started)/1000+prepared.timings_seconds.preprocess}};
  // Deliberately non-enumerable: the core adopts buffer ownership before it
  // presents/serializes the numerical result. It must eventually call release.
  let released=false;Object.defineProperty(result,'release',{value:()=>{if(released)return;released=true;scoreOwner.release();validOwner.release();displayOwner?.release?.();}});
  if(render){const display=await renderBoundedWindow(prepared,result,{x:0,y:0,width,height},{signal,threshold});displayOwner=display;Object.assign(result,display);}
  success=true;return result;
 }finally{if(pendingInput){const state=await pendingInput;state.input?.release();}if(!success){scoreOwner?.release();validOwner?.release();displayOwner?.release?.();}}
}

/** Window-only presentation; changing threshold/colors does not run the model.
 * Caller owns this small RGBA/mask window. Source windows are always released. */
export async function renderBoundedWindow(prepared,result,{x,y,width,height},{signal,threshold=.5,overlay=true}={}){
 prepared.assertAlive();check(signal);requireValue(width*height<=16*1024**2,'DTD render window exceeds16MP; use smaller presentation windows.');requireValue([x,y,width,height].every(Number.isSafeInteger)&&x>=0&&y>=0&&width>0&&height>0&&x+width<=prepared.width&&y+height<=prepared.height,'Invalid DTD presentation window.');
 const owners=[];let sourcePart,success=false;
 const allocate=(Type,count,label)=>{const owner=outputArray(Type,count,prepared.budget,label);owners.push(owner);return owner.data;};
 try{
  const mask=allocate(Uint8Array,width*height,'window-mask'),heatmapRGBA=allocate(Uint8ClampedArray,width*height*4,'window-heatmap'),overlayRGBA=overlay?allocate(Uint8ClampedArray,width*height*4,'window-overlay'):null;
  if(overlay)sourcePart=await prepared.source.readWindow({x,y,width,height},{signal});const pixels=sourcePart?partPixels(sourcePart):null,channels=pixels?.data.length/(width*height);
  for(let row=0;row<height;row++){check(signal);for(let col=0;col<width;col++){
   const j=row*width+col,i=(y+row)*prepared.width+x+col,s=result.scoreMap[i],valid=result.validRegion[i]!==0;
   if(overlay)for(let c=0;c<3;c++)overlayRGBA[4*j+c]=pixels.data[j*channels+c];if(overlay)overlayRGBA[4*j+3]=255;
   if(!valid)continue;mask[j]=s>=threshold?255:0;heatmapRGBA[4*j]=Math.round(s*255);heatmapRGBA[4*j+2]=Math.round((1-s)*255);heatmapRGBA[4*j+3]=255;
   if(overlay){const alpha=.5*s;overlayRGBA[4*j]=Math.floor(overlayRGBA[4*j]*(1-alpha)+255*alpha);overlayRGBA[4*j+1]=Math.floor(overlayRGBA[4*j+1]*(1-alpha));overlayRGBA[4*j+2]=Math.floor(overlayRGBA[4*j+2]*(1-alpha));}
  }}
  const presentation={mask,heatmapRGBA,...(overlay?{overlayRGBA}:{})};let released=false;Object.defineProperty(presentation,'release',{value:()=>{if(released)return;released=true;for(const owner of owners)owner.release();}});success=true;return presentation;
 }finally{sourcePart?.release?.();if(!success)for(const owner of owners)owner.release();}
}
