/* Text recognition via official PP-OCRv6 Medium FP32 detector + recognizer.
 * All source pixels are visited by overlapping detector windows. Native model
 * preprocessing is explicit; no detector-only exclusions become fake text. */
import {NeuralGraphPool} from './neural-graph-pool.js';
import {scientificTextTiles,prepareScientificTextInput,scientificTextBoxes} from './scientific-text-detector.js';
import {fetchVerifiedAsset} from './fetch-verified-asset.js';
import {requireValue,checkAbort,EngineError} from './errors.js';
import {PPOCR_MEDIUM,preparePpocrLine,decodePpocrCtc,decodePpocrOrientation} from './ppocr-recognition.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const MiB=1024**2,DETECTOR_SIDES=[4000,3072,2560,2048,1536,1024,736];
export function planPpocrDetection(width,height,budgetBytes,{backend='auto',threads=1}={}){
 requireValue(Number.isSafeInteger(budgetBytes)&&budgetBytes>0,'Invalid PP-OCR memory budget.');
 for(const maxInputSide of DETECTOR_SIDES){const tiles=scientificTextTiles(width,height,{maxInputSide,overlap:128});let peak=0,cap=0;
  for(const [x,y,r,b] of tiles){const w=r-x,h=b-y,scale=Math.max(1,736/Math.min(w,h)),n=Math.max(32,Math.round(w*scale/32)*32)*Math.max(32,Math.round(h*scale/32)*32),workspace=n*512,heap=Math.ceil((64*MiB+PPOCR_MEDIUM.detector.bytes*2+workspace)/MiB/16)*16*MiB;
   cap=Math.max(cap,heap);peak=Math.max(peak,heap+PPOCR_MEDIUM.detector.bytes*2+4*MiB+n*32+w*h*3+8*MiB+Math.max(0,threads-1)*2*MiB+(backend==='webgpu'?PPOCR_MEDIUM.detector.bytes+workspace:0));
  }
  if(cap<=4*1024**3&&peak<=budgetBytes)return {maxInputSide,tiles,estimatedPeakBytes:peak,estimatedWasmMaximumBytes:cap,estimateIncludes:'graph cap, resident weights, source/input/output staging, geometry and thread allowance; shared admission remains authoritative'};
 }
 throw new EngineError('MEMORY_LIMIT','The official PP-OCR Medium minimum input cannot be admitted within this budget.',{details:{budgetBytes,minimumInputSide:736,noResolutionReduction:true}});
}
function splitPpocrWindow(tile,maxInputSide){const [x,y,r,b]=tile;return scientificTextTiles(r-x,b-y,{maxInputSide,overlap:128}).map(q=>[q[0]+x,q[1]+y,q[2]+x,q[3]+y]);}

export function createPpocrAnalyzer({budget,profile,configuration,poolFactory=(...args)=>new NeuralGraphPool(...args)}={}){
 requireValue(budget&&profile&&configuration?.assets&&configuration.dictionary&&configuration.runtimes,'PP-OCR Medium is not configured.');
 for(const [key,identity] of [['det',PPOCR_MEDIUM.detector],['rec',PPOCR_MEDIUM.recognizer],['ori',PPOCR_MEDIUM.orientation]])requireValue(configuration.assets[key]?.sha256===identity.sha256&&configuration.assets[key]?.bytes===identity.bytes,'PP-OCR Medium model identity differs from the qualified official export.');
 requireValue(configuration.dictionary.sha256===PPOCR_MEDIUM.dictionary.sha256&&configuration.dictionary.bytes===PPOCR_MEDIUM.dictionary.bytes,'PP-OCR dictionary identity differs from its model.');
 const pool=poolFactory(budget,profile,{assets:configuration.assets,runtimes:configuration.runtimes,resourceOwner:'ocr-ppocr'});let dictionary,releaseDictionary,disposed=false,dictionaryEpoch=0;
 async function loadDictionary(signal){
  if(dictionary)return dictionary;
  const epoch=dictionaryEpoch,release=budget.reserve(configuration.dictionary.bytes*4+PPOCR_MEDIUM.characters*96);try{const bytes=await fetchVerifiedAsset(configuration.dictionary,{signal}),value=JSON.parse(new TextDecoder().decode(bytes));requireValue(Array.isArray(value)&&value.length===PPOCR_MEDIUM.characters&&value.every(x=>typeof x==='string'),'PP-OCR dictionary is malformed.');checkAbort(signal);if(disposed||epoch!==dictionaryEpoch)throw new EngineError('CANCELLED','PP-OCR dictionary initialization was retired.');dictionary=value;releaseDictionary=release;return dictionary;}catch(error){release();throw error;}
 }
 function clearCache(){dictionaryEpoch++;pool.clear();dictionary=null;releaseDictionary?.();releaseDictionary=null;}
 return {
  clearCache,
  dispose(){if(disposed)return;disposed=true;clearCache();pool.dispose();},
  async analyze(image,params={}, {signal,onProgress,backend='auto'}={}){
   requireValue(!disposed,'PP-OCR analyzer is disposed.');requireValue(['auto','cpu','webgpu'].includes(backend),'Invalid OCR backend.');requireValue(image?.format==='rgb8'&&[image.width,image.height].every(n=>Number.isSafeInteger(n)&&n>0),'PP-OCR requires original RGB8 geometry.');
   const orientationCorrection=params.orientationCorrection??true,bitmapThreshold=params.bitmapThreshold??.2,boxThreshold=params.boxThreshold??.45,unclipRatio=params.unclipRatio??1.4;requireValue(typeof orientationCorrection==='boolean'&&[bitmapThreshold,boxThreshold].every(x=>Number.isFinite(x)&&x>0&&x<1)&&Number.isFinite(unclipRatio)&&unclipRatio>0,'Invalid PP-OCR native parameters.');
   const started=performance.now(),releases=[],regions=[],execution=[],plan=planPpocrDetection(image.width,image.height,budget.limit,{backend,threads:profile.maxWorkers}),tiles=plan.tiles,windowSides=tiles.map(()=>plan.maxInputSide),attempts=[];let complete=false,candidates=0,truncated=false;
   try{const chars=await loadDictionary(signal);
    for(let t=0;t<tiles.length;t++){
     checkAbort(signal);onProgress?.({phase:'ocr-detection',completed:t,total:tiles.length});let input,detected;
     try{input=await prepareScientificTextInput(image,tiles[t],{signal,budget});const n=input.width*input.height;detected=await pool.run('det',{x:input.tensor},{signal,backend,workspaceBytes:n*512,outputBytes:n*4,onProgress});execution.push({stage:'det',...detected.metrics});const output=detected.result[PPOCR_MEDIUM.output];requireValue(output?.dims?.length===4&&output.dims[0]===1&&output.dims[1]===1&&output.dims[2]===input.height&&output.dims[3]===input.width,'PP-OCR detector shape does not match its input.');
      const result=await scientificTextBoxes(output.data,input.width,input.height,{signal,budget,tile:tiles[t],sourceWidth:image.width,sourceHeight:image.height,bitmapThreshold,boxThreshold,unclipRatio});candidates+=result.candidates;truncated ||=result.truncated;
      // Admit decoded geometry before the graph lease is retired.
      releases.push(budget.reserve(result.detections.length*2048));
      for(const item of result.detections)regions.push({...item,tile:t});attempts.push({tile:[...tiles[t]],maxInputSide:windowSides[t],inputDimensions:[input.width,input.height],status:'complete'});
     }catch(error){
      if(error.code!=='MEMORY_LIMIT')throw error;const current=windowSides[t],next=DETECTOR_SIDES.find(side=>side<=1536&&side<current);if(!next)throw error;const replacement=splitPpocrWindow(tiles[t],next);if(replacement.length===1&&replacement[0].every((v,i)=>v===tiles[t][i]))throw error;attempts.push({tile:[...tiles[t]],maxInputSide:current,status:'memory-admission-refused',retryMaxInputSide:next,error:{code:error.code,message:error.message}});tiles.splice(t,1,...replacement);windowSides.splice(t,1,...replacement.map(()=>next));t--;
     }finally{detected?.release();input?.release();}
    }
    // Overlapping source windows may detect the same line twice. Prefer the
    // stronger native detection only when the geometry almost coincides.
    const selected=[];for(const d of regions.sort((a,b)=>b.confidence-a.confidence)){
     const xs=d.polygon.map(p=>p[0]),ys=d.polygon.map(p=>p[1]),bounds=[Math.floor(Math.min(...xs)),Math.floor(Math.min(...ys)),Math.ceil(Math.max(...xs))+1,Math.ceil(Math.max(...ys))+1].map((v,i)=>clamp(v,0,i%2?image.height:image.width));d.bounds=bounds;
     if(selected.some(q=>{if(q.tile===d.tile)return false;const a=q.bounds,common=Math.max(0,Math.min(a[2],bounds[2])-Math.max(a[0],bounds[0]))*Math.max(0,Math.min(a[3],bounds[3])-Math.max(a[1],bounds[1]));return common/Math.max(1,Math.max((a[2]-a[0])*(a[3]-a[1]),(bounds[2]-bounds[0])*(bounds[3]-bounds[1])))>.8;}))continue;selected.push(d);
    }
    selected.sort((a,b)=>a.bounds[1]-b.bounds[1]||a.bounds[0]-b.bounds[0]);const output=[];
    // Keep one official graph resident across all lines rather than reloading
    // recognition weights between every orientation job. Original windows are
    // borrowed again for recognition; no entire-page crop cache is retained.
    for(let i=0;i<selected.length;i++){
     if(!orientationCorrection){selected[i].orientation={reverse:false,skipped:true,source:'disabled'};continue;}
     checkAbort(signal);onProgress?.({phase:'ocr-orientation',completed:i,total:selected.length});const input=await preparePpocrLine(image,selected[i].polygon,{signal,budget});let run;
     try{run=await pool.run('ori',{x:input.orientationTensor},{signal,backend,workspaceBytes:160*80*512,outputBytes:8,onProgress});execution.push({stage:'ori',...run.metrics});selected[i].orientation=decodePpocrOrientation(run.result[PPOCR_MEDIUM.output]);}finally{run?.release();input.release();}
    }
    onProgress?.({phase:'ocr-orientation',completed:selected.length,total:selected.length});
    for(let i=0;i<selected.length;i++){
     checkAbort(signal);onProgress?.({phase:'ocr-recognition',completed:i,total:selected.length});const detection=selected[i],input=await preparePpocrLine(image,detection.polygon,{signal,budget});let run;
     try{const width=input.shape.inputWidth,tensor=await input.recognition(detection.orientation.reverse);run=await pool.run('rec',{x:tensor},{signal,backend,workspaceBytes:width*48*512,outputBytes:(Math.ceil(width/8)+2)*PPOCR_MEDIUM.classes*4,onProgress});execution.push({stage:'rec',...run.metrics});const decoded=decodePpocrCtc(run.result[PPOCR_MEDIUM.output],chars);if(!decoded.text)continue;releases.push(budget.reserve(decoded.text.length*8+2048));output.push({id:'ppocr-line-'+i,text:decoded.text,bounds:detection.bounds,polygon:detection.polygon,confidence:decoded.confidence,score:decoded.confidence,confidenceScale:'ppocr-ctc-0-1',detectionConfidence:detection.confidence,orientation:detection.orientation,modelWidthLimited:48*Math.max(input.shape.width/input.shape.height,input.shape.height/input.shape.width)>3200,lineKey:'ppocr/'+i,tile:detection.tile});
     }finally{run?.release();input.release();}
    }
    checkAbort(signal);onProgress?.({phase:'ocr-recognition',completed:selected.length,total:selected.length});let released=false;const release=()=>{if(released)return;released=true;for(const f of releases.splice(0))f();};complete=true;
    return {regions:output,nativeText:output.map(r=>r.text).join('\n'),metadata:{algorithm:'PP-OCRv6 Medium',models:{detector:PPOCR_MEDIUM.detector,recognizer:PPOCR_MEDIUM.recognizer,orientation:PPOCR_MEDIUM.orientation,dictionary:PPOCR_MEDIUM.dictionary},precision:'float32',coordinateSpace:'original-image-pixels',sourceSha256:image.sha256??null,channels:'BGR',textRecognition:true,probabilityCalibration:false,sourcePixelsModified:false,thresholdApplied:false,detectorWindows:tiles,preprocess:{officialMinimumSide:736,officialMaximumSide:4000,plannedMaxInputSide:plan.maxInputSide,estimatedPeakBytes:plan.estimatedPeakBytes,admissionAttempts:attempts,resolutionReduced:false},postprocess:{implementation:'connected-component-hull/minimum-rectangle-offset',bitmapThreshold,boxThreshold,unclipRatio,maxCandidates:3000,candidates,truncated},recognizer:{height:48,minimumWidth:320,maximumWidth:3200,ctcBlank:0,spaceIndex:18709,cropInterpolation:'opencv-cubic-5bit/15bit-replicate',resizeInterpolation:'integer-bilinear-half-pixel',orientation:orientationCorrection?'official-PP-LCNet_x1_0_textline_ori':'disabled',orientationInputChannels:'RGB'},warnings:[...(truncated?[{code:'candidate-limit',message:'The published detector candidate limit was reached.'}]:[]),...(tiles.length>1?[{code:'windowed-transcription',message:'All source pixels were visited in overlapping windows. Lines crossing a window boundary may be transcribed as fragments.'}]:[])]},metrics:{milliseconds:performance.now()-started,execution,regions:output.length,pool:pool.snapshot()},release};
   }finally{if(!complete)for(const f of releases.splice(0))f();}
  }
 };
}
