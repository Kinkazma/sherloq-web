import "../runtime-context.js?v=0.21.0";
/** DTD browser preprocessing/reconstruction; ORT and JPEG are injected/reused.
 * Source: qcf-568/DocTamper @ 2d53389932f72941575adbb595377955d366881c.
 * No model download, session, thread pool, image decoder or server is created here.
 */
import {allocateTypedArray} from '../unified-engine/src/allocation.js';
export const METHOD = 'doctamper';
export const TILE = 512;
export const MODEL_ASSET = Object.freeze({
  id: 'doctamper-dtd-fp32-opset17',
  url: 'models/doctamper/doctamper.onnx',
  sha256: 'a8c8ab115523350f03f42005f0b724ed8fee828acd283b47b3cf44678dfc4f73',
  bytes: 268570166,
  inputs: ['rgb', 'dct', 'qt'], outputs: ['logits'], batch: 1,
});
export const SCIENTIFIC_LIMITS = Object.freeze([
  'DTD cible les retouches de texte dans les documents ; une photographie sans document est hors de son domaine évalué.',
  'Les activations locales ne sont ni une probabilité globale de falsification ni un verdict d’authenticité.',
  'Pour un TIFF, les DCT proviennent d’un JPEG de travail gris Q90 déclaré ; elles ne décrivent pas la compression native de la source.',
  'Sans masque de référence, aucune précision, aucun faux positif et aucun faux négatif ne peuvent être mesurés sur cette image.',
]);
const MEAN = [0.485, 0.455, 0.406].map(Math.fround);
const STD = [0.229, 0.224, 0.225].map(Math.fround);
const cacheFallback = new Map();
const identities = new WeakMap(); let nextIdentity = 1;
const now = () => globalThis.performance?.now() ?? Date.now();
function check(signal) { if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError'); }
function requireValue(condition, message) { if (!condition) throw new Error(message); }
function memoized(memo, identity, key, create) {
  if (memo?.get && !memo?.set) {
    if (!identities.has(identity)) identities.set(identity,nextIdentity++);
    return memo.get(key+":raster-"+identities.get(identity),create);
  }
  const store = memo?.get && memo?.set ? memo : cacheFallback;
  let weak = store.get(key);
  if (!weak) { weak = new WeakMap(); store.set(key, weak); if(store===cacheFallback && store.size>32)store.delete(store.keys().next().value); }
  let value = weak.get(identity);
  if (!value) {
    value = Promise.resolve().then(create);
    weak.set(identity, value);
    value.catch(() => weak.delete(identity));
  }
  return value;
}

export function tileBoxes(width, height) {
  requireValue(width >= TILE && height >= TILE, 'DTD analysis plane must be at least 512×512.');
  const boxes = [], nx = Math.floor(width / TILE), ny = Math.floor(height / TILE);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) boxes.push([x*TILE, y*TILE, (x+1)*TILE, (y+1)*TILE]);
  if (width % TILE) for (let y = 0; y < ny; y++) boxes.push([width-TILE, y*TILE, width, (y+1)*TILE]);
  if (height % TILE) for (let x = 0; x < nx; x++) boxes.push([x*TILE, height-TILE, (x+1)*TILE, height]);
  if (width % TILE && height % TILE) boxes.push([width-TILE, height-TILE, width, height]);
  return boxes;
}

/** Pillow RGB→L coefficients, rounded exactly as its integer conversion. */
export function pillowLuma(r, g, b) { return (19595*r + 38470*g + 7471*b + 32768) >>> 16; }
function rasterData(image) {
  const {width, height, data} = image;
  requireValue(Number.isSafeInteger(width) && Number.isSafeInteger(height) && width>0 && height>0, 'Invalid source dimensions.');
  const channels = data?.length / (width*height);
  requireValue(channels===3 || channels===4, 'Expected already oriented RGB8/RGBA8 raster.');
  return {width, height, data, channels};
}
function rgbaCopy(raster) {
  const {width,height,data,channels} = raster, out = new Uint8ClampedArray(width*height*4);
  for (let i=0; i<width*height; i++) {
    out[4*i]=data[channels*i]; out[4*i+1]=data[channels*i+1]; out[4*i+2]=data[channels*i+2]; out[4*i+3]=255;
  }
  return out;
}
function grayscale(raster) {
  const {width,height,data,channels} = raster, out = new Uint8Array(width*height);
  for (let i=0; i<out.length; i++) out[i]=pillowLuma(data[i*channels],data[i*channels+1],data[i*channels+2]);
  return {width,height,data:out,format:'gray8'};
}
function paddedGray(gray) {
  const width=Math.max(TILE,gray.width),height=Math.max(TILE,gray.height);
  if (width===gray.width && height===gray.height) return gray;
  const data=new Uint8Array(width*height);data.fill(255);
  for(let y=0;y<gray.height;y++)data.set(gray.data.subarray(y*gray.width,(y+1)*gray.width),y*width);
  return {width,height,data,format:'gray8'};
}
function validateDCT(extracted, width, height) {
  const coefficients=extracted.coefficients ?? extracted.coeff ?? extracted.data;
  const table=extracted.quantizationTable ?? extracted.table ?? extracted.qt;
  const stride=extracted.stride ?? extracted.paddedWidth ?? Math.ceil(width/8)*8;
  requireValue(coefficients && table?.length===64 && stride>=width, 'JPEG hook must return coefficient-plane data, stride and natural-order luminance QT.');
  requireValue(coefficients.length>=stride*Math.ceil(height/8)*8,'Incomplete stored JPEG coefficient plane.');
  requireValue(Array.from(table).every(v=>Number.isInteger(v)&&v>=0&&v<=63),'Luminance QT outside official FPH embedding range 0..63.');
  return {coefficients,table,stride,provenance:extracted.provenance ?? null};
}

/**
 * prepare(image,{memo,signal,onProgress,workingDCT,encodeJPEG,nativeDCT})
 * image: already oriented RGB/RGBA raster, optionally sourceFormat/encodedBytes.
 * Preferred reused hook workingDCT(gray,{quality:90,signal}) returns the stored
 * coefficient plane + QT in one codec pass. Alternative: encodeJPEG then nativeDCT.
 */
export async function prepare(image, options={}) {
  if(options.memoryMode==='bounded'||image.surface?.readWindow||typeof image.readWindow==='function'){const {prepareBounded}=await import('./doctamper-bounded.js');return prepareBounded(image,options);}
  const {memo,signal,onProgress}=options, raster=rasterData(image);
  check(signal);
  // Raster pixels alone do not identify native JPEG compression history.
  // Inputs are immutable while cached; different source bytes/geometry must
  // select different preparations even when decoded RGB storage is shared.
  const sourceBytes=image.encodedBytes;
  if(sourceBytes && !identities.has(sourceBytes))identities.set(sourceBytes,nextIdentity++);
  const prepIdentity=JSON.stringify([raster.width,raster.height,String(image.sourceFormat??'').toUpperCase(),image.exifOrientation??1,sourceBytes?identities.get(sourceBytes):null]);
  return memoized(memo, image.data, 'doctamper:prepare:q90-gray-v2:'+prepIdentity, async()=>{
    const started=now(),sourceRGBA=rgbaCopy(raster);
    const nativeJPEG=String(image.sourceFormat??'').toUpperCase()==='JPEG' && image.encodedBytes &&
      (image.exifOrientation==null || image.exifOrientation===1) && Math.min(raster.width,raster.height)>=TILE;
    let visual, extracted, workingCopy=false;
    if (nativeJPEG) {
      requireValue(typeof options.nativeDCT==='function','Native JPEG DCT hook is required.');
      visual={...raster,grayscale:false};
      extracted=await memoized(memo,image.encodedBytes,'jpeg:stored-luminance-dct',()=>options.nativeDCT(image.encodedBytes,{signal}));
    } else {
      const gray=await memoized(memo,image.data,'raster:pillow-luma-v1',()=>grayscale(raster));
      visual={...paddedGray(gray),grayscale:true};workingCopy=true;
      onProgress?.({method:METHOD,phase:'working-jpeg-q90',completed:0,total:1});
      if (typeof options.workingDCT==='function') {
        extracted=await options.workingDCT(visual,{quality:90,grayscale:true,signal});
      } else {
        requireValue(typeof options.encodeJPEG==='function' && typeof options.nativeDCT==='function',
          'DTD on TIFF requires reused grayscale JPEG Q90 encoding and stored DCT hooks; no spatial-DCT approximation is accepted.');
        const encoded=await options.encodeJPEG(visual,{quality:90,grayscale:true,signal});
        requireValue(encoded instanceof Uint8Array,'encodeJPEG must return encoded JPEG bytes.');
        extracted=await options.nativeDCT(encoded,{signal});
      }
      onProgress?.({method:METHOD,phase:'working-jpeg-q90',completed:1,total:1});
    }
    check(signal);
    const dct=validateDCT(extracted,visual.width,visual.height);
    const width=Math.floor(visual.width/8)*8,height=Math.floor(visual.height/8)*8;
    const prepared={method:METHOD,image,sourceRGBA,visual,dct,width:raster.width,height:raster.height,analysisWidth:width,analysisHeight:height,
      preprocessing:{source_size:[raster.width,raster.height],analyzed_size:[width,height],jpeg_working_copy:workingCopy,
        working_jpeg_quality:workingCopy?90:null,dct_provenance:workingCopy?'new grayscale JPEG Q90 working copy; not native TIFF traces':'native source JPEG',
        normalization_mean:Array.from(MEAN),normalization_std:Array.from(STD),tile_size:TILE,
        merge_rule:'upstream last-write overlap order, no averaging',grayscale_visual:workingCopy,
        unprocessed_border_right_bottom:[Math.max(0,raster.width-width),Math.max(0,raster.height-height)],
        source_modified:false,codec:extracted.provenance??null},
      timings_seconds:{preprocess:(now()-started)/1000},patches:[]};
    prepared.patches=tileBoxes(width,height).map(box=>({box}));
    prepared.preprocessing.tile_count=prepared.patches.length;
    return prepared;
  });
}

/** Lazily create only one patch's feeds; caller owns/reuses the ORT session. */
export function patchFeeds(prepared, patch) {
  const [x0,y0]=patch.box, n=TILE*TILE;
  const rgb=new Float32Array(3*n),dct=new BigInt64Array(n),qt=new BigInt64Array(64);
  const visual=prepared.visual, coeff=prepared.dct.coefficients, stride=prepared.dct.stride;
  for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){
    const i=y*TILE+x,source=(y+y0)*visual.width+x+x0;
    for(let c=0;c<3;c++){
      const v=visual.grayscale?visual.data[source]:visual.data[source*visual.channels+c];
      rgb[c*n+i]=Math.fround(Math.fround(Math.fround(v/255)-MEAN[c])/STD[c]);
    }
    dct[i]=BigInt(Math.min(20,Math.abs(coeff[(y+y0)*stride+x+x0])));
  }
  for(let i=0;i<64;i++)qt[i]=BigInt(prepared.dct.table[i]);
  return {rgb:{data:rgb,dims:[1,3,TILE,TILE],type:'float32'},dct:{data:dct,dims:[1,TILE,TILE],type:'int64'},qt:{data:qt,dims:[1,1,8,8],type:'int64'}};
}

export function foregroundFromLogits(logits,output) {
  const data=logits?.data??logits,n=TILE*TILE;
  requireValue(data?.length===2*n,'DTD logits must be [1,2,512,512].');
  const scores=output??allocateTypedArray(Float32Array,n,{label:'DTD-tile-foreground'});
  requireValue(scores instanceof Float32Array&&scores.length===n,'DTD foreground output must be Float32[512,512].');
  for(let i=0;i<n;i++){
    const diff=data[n+i]-data[i];
    scores[i]=diff>=0?1/(1+Math.exp(-diff)):Math.exp(diff)/(1+Math.exp(diff));
    requireValue(Number.isFinite(scores[i]),'Non-finite DTD foreground score.');
  }
  return scores;
}
function render(prepared,scoreMap,threshold) {
  const n=prepared.width*prepared.height,valid=new Uint8Array(n),mask=new Uint8Array(n);
  const heatmap=new Uint8ClampedArray(n*4),overlay=prepared.sourceRGBA.slice();
  let count=0,positive=0,sum=0,min=Infinity,max=-Infinity;
  for(let i=0;i<n;i++){
    const s=scoreMap[i];if(!Number.isFinite(s))continue;
    valid[i]=255;count++;sum+=s;min=Math.min(min,s);max=Math.max(max,s);
    if(s>=threshold){positive++;mask[i]=255;}
    heatmap[4*i]=Math.round(s*255);heatmap[4*i+2]=Math.round((1-s)*255);heatmap[4*i+3]=255;
    const alpha=.5*s;overlay[4*i]=Math.floor(overlay[4*i]*(1-alpha)+255*alpha);
    overlay[4*i+1]=Math.floor(overlay[4*i+1]*(1-alpha));overlay[4*i+2]=Math.floor(overlay[4*i+2]*(1-alpha));
  }
  requireValue(count>0,'No DTD pixels were processed.');
  return {scoreMap,validRegion:valid,mask,heatmapRGBA:heatmap,overlayRGBA:overlay,
    scores:{kind:'descriptive local activations, not global probability',minimum:min,mean:sum/count,maximum:max,
      fraction_valid_pixels_at_or_above_threshold:positive/count,threshold,valid_pixel_count:count,unprocessed_pixel_count:n-count}};
}

/** runtime.infer(asset,feeds,{signal}) -> {logits:{data,dims}} or {outputs:{logits}}.
 * The common runtime alone controls CPU/GPU concurrency, sessions, caching and I/O.
 */
export async function analyze(prepared,options={}) {
  if(prepared.mode==='bounded'){const {analyzeBounded}=await import('./doctamper-bounded.js');return analyzeBounded(prepared,options);}
  const {runtime,asset=MODEL_ASSET,signal,onProgress,threshold=.5}=options;
  requireValue(typeof runtime?.infer==='function','Shared runtime.infer is required.');
  requireValue(threshold>=0&&threshold<=1,'Invalid display threshold.');
  check(signal);
  const started=now(),scores=new Float32Array(prepared.width*prepared.height);scores.fill(NaN);
  let inferenceMs=0;
  for(let i=0;i<prepared.patches.length;i++){
    check(signal);
    const patch=prepared.patches[i],feeds=patchFeeds(prepared,patch),before=now();
    const output=await runtime.infer(asset,feeds,{signal});
    inferenceMs+=now()-before;
    let map;
    try { check(signal); map=foregroundFromLogits(output.logits??output.outputs?.logits); }
    finally { output.release?.(); }
    const [x0,y0,x1,y1]=patch.box,xx=Math.min(x1,prepared.width),yy=Math.min(y1,prepared.height);
    for(let y=y0;y<yy;y++)scores.set(map.subarray((y-y0)*TILE,(y-y0)*TILE+xx-x0),y*prepared.width+x0);
    onProgress?.({method:METHOD,phase:'inference',completed:i+1,total:prepared.patches.length});
  }
  const postStart=now(),display=render(prepared,scores,threshold);
  return {method:METHOD,status:'ok',width:prepared.width,height:prepared.height,...display,global_verdict:null,
    preprocessing:prepared.preprocessing,scientific_limits:Array.from(SCIENTIFIC_LIMITS),asset,
    timings_seconds:{...prepared.timings_seconds,inference:inferenceMs/1000,postprocess:(now()-postStart)/1000,total:(now()-started)/1000+prepared.timings_seconds.preprocess}};
}

export {prepareBounded,patchFeedsBounded,analyzeBounded,renderBoundedWindow} from './doctamper-bounded.js';
