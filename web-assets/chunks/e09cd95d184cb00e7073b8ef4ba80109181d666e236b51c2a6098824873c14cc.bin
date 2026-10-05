import "../../runtime-context.js?v=0.14.5";
import {createCatnetSegmentedAnalyzer,renderCatnetSegmented} from './catnet-segmented-analyzer.js';
import {Budget} from './cache.js';import {resolveComputeProfile} from './profiles.js';
import {NeuralGraphPool} from './neural-graph-pool.js';import {CatnetPreparation} from './catnet-preparation.js';
import {EngineError,requireValue,checkAbort} from './errors.js';import {renderResearch} from './research-render.js';import {catnetNpz} from './npz.js';
const hash=async data=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');
export function catnetCropOrient(padded,metadata){
 const [h,w]=metadata.source_shape,[ph,pw]=metadata.padded_shape,o=metadata.orientation,width=o>=5?h:w,height=o>=5?w:h,out=new Float32Array(w*h);
 requireValue(padded instanceof Float32Array&&padded.length===ph*pw,'Invalid padded CAT-Net map.');
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let dx=x,dy=y;
  if(o===2)dx=w-1-x;else if(o===3){dx=w-1-x;dy=h-1-y;}else if(o===4)dy=h-1-y;else if(o===5){dx=y;dy=x;}else if(o===6){dx=h-1-y;dy=x;}else if(o===7){dx=h-1-y;dy=w-1-x;}else if(o===8){dx=y;dy=w-1-x;}
  out[dy*width+dx]=padded[y*pw+x];
 }
 return {width,height,data:out};
}
export function createCatnetAnalyzer({assets={},segments,runtimes,jpegFactory,budget,computeProfile='aggressive',resourceHints}={}){
  runtimes=structuredClone(runtimes);assets=structuredClone(assets);const configuration=JSON.stringify([assets,runtimes]);
 assets=Object.fromEntries(Object.entries(assets).map(([key,asset])=>[key,{...asset,preferredLayout:'NCHW'}]));
 const profile=resolveComputeProfile(computeProfile,resourceHints);budget??=new Budget(profile.memoryBudgetBytes);
 segments=segments?structuredClone(segments):null;const segmented=segments?createCatnetSegmentedAnalyzer({manifest:segments,runtimes,jpegFactory,budget,profile}):null;
 const pool=new NeuralGraphPool(budget,profile,{assets,runtimes}),preparation=new CatnetPreparation(budget,jpegFactory),keys=new Set();let active,disposed=false;
 return {
  async analyze(image,{sourceBytes,memoryBounded}={},options={}){
   if(disposed)throw new EngineError('DISPOSED','CAT-Net analyzer disposed.');if(active)throw new EngineError('BUSY','CAT-Net analysis already running.');
   if(image.surface){requireValue(sourceBytes===undefined&&memoryBounded!==false,'Segmented CAT-Net consumes its original JPEG with bounded native operators.');requireValue(segmented,'CAT-Net segmented operator assets are required.');active=true;try{return await segmented.analyze(image,{},options);}finally{active=null;}}
   const {width,height}=image,n=width*height;requireValue(Number.isInteger(width)&&Number.isInteger(height)&&Number.isSafeInteger(n)&&n>0&&image.data instanceof Uint8Array&&image.data.length===3*n,'RGB8 image required.');
   requireValue(memoryBounded===undefined||typeof memoryBounded==='boolean','Invalid CAT-Net memory option.');requireValue(sourceBytes===undefined||sourceBytes instanceof Uint8Array,'Invalid original image bytes.');
   const controller=new AbortController(),abort=()=>controller.abort();active=controller;options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();const hooks={...options,signal:controller.signal};
   let inputLease,companion,prepared,output,release,cacheLease;
   try{
    checkAbort(hooks.signal);inputLease=budget.reserve(n*6+(sourceBytes?.length??0)*2);
    const original=sourceBytes?.[0]===255&&sourceBytes?.[1]===216;
    if(!original)companion=await preparation.companion(image,hooks);
    const bytes=original?sourceBytes:companion.data,sourceHash=await hash(bytes),pixelHash=await hash(image.data),bounded=memoryBounded??(!!assets.compact||Math.ceil(width/8)*8*Math.ceil(height/8)*8>4000000),name=bounded?(assets.compact?'compact':'bounded'):'standard',asset=assets[name];requireValue(asset,'Requested CAT-Net graph is unavailable.');
    const key='m2/catnet/'+JSON.stringify([sourceHash,pixelHash,width,height,asset.sha256,options.backend??'auto',configuration]);
    let stored=budget.get(key)?.value,cached=!!stored;
    if(cached)cacheLease=budget.reserve(stored.data.map.byteLength+stored.data.native_map.byteLength+8192);
    else{
     prepared=await preparation.prepare(bytes,{...hooks,compactDct:!!asset.compactDct,image:original?image:undefined});
     const [ph,pw]=prepared.metadata.padded_shape,pixels=ph*pw;
     const feeds={image:prepared.image,table:prepared.table},rowBudget=Math.max(pw*512*17,Math.floor(Math.min(128*1024**2,budget.limit/16)));
     if(asset.compactDct){feeds.dct_codes=prepared.dct_codes;feeds.dct_budget={data:BigInt64Array.of(BigInt(rowBudget)),dims:[],type:'int64'};}
     output=await pool.run(name,feeds,{...hooks,workspaceBytes:asset.compactDct?128*1024**2+pixels*128+rowBudget*2:192*1024**2+pixels*(bounded?1024:2048)+(bounded?pw*128*512:0),outputBytes:pixels*8});
     for(const tensor of Object.values(output.result))for(const value of tensor.data)requireValue(Number.isFinite(value),'Nonfinite CAT-Net output.');
     const native=output.result.native_map;requireValue(native.data instanceof Float32Array&&native.dims.length===2,'Invalid native CAT-Net map.');
     // Admit the cropped/oriented map while padded and raw network outputs are live.
     cacheLease=budget.reserve(n*4+8192);const map=catnetCropOrient(output.result.padded_map.data,prepared.metadata);
     stored={data:{width:map.width,height:map.height,map:map.data,native_map:native.data,nativeShape:native.dims,metadata:{method:'catnet',...prepared.metadata,memory_bounded:bounded,compact_dct:!!asset.compactDct,jpeg_source:original?'original':'companion_q100_444',jpeg_sha256:sourceHash}},provenance:{sourceRGBSha256:pixelHash,jpegSha256:sourceHash,modelSha256:asset.sha256,checkpointSha256:asset.checkpointSha256,provider:output.provider,qualification:asset.qualification??'component'},execution:output.metrics};
    }
    checkAbort(hooks.signal);const size=stored.data.map.byteLength+stored.data.native_map.byteLength+8192;release=budget.reserve(size);const result=structuredClone(stored);
    if(!cached){budget.put(key,{value:stored,byteLength:size});keys.add(key);}
    return {...result,metrics:{...result.execution,cache:{result:cached},memory:budget.snapshot(),preflightExecutions:0},release};
   }catch(e){release?.();throw e;}finally{cacheLease?.();output?.release();prepared?.release();companion?.release();inputLease?.();active=null;options.signal?.removeEventListener('abort',abort);}
  },
  renderWindow(image,result,mode,rect,options={}){requireValue(result.data.segmented,'Segmented result required.');return renderCatnetSegmented(image,result,mode,rect,{...options,budget});},
  render(image,result,mode=0,options={}){if(result.data.segmented)return renderCatnetSegmented(image,result,mode,null,{...options,budget});return renderResearch(image,result.data,mode,{...options,budget});},
  exportNpz(result){const bound=result.data.map.byteLength+result.data.native_map.byteLength+65536,release=budget.reserve(bound);try{return {...catnetNpz(result,bound),release};}catch(e){release();throw e;}},
  async clearCache(){for(const k of keys)budget.remove(k);keys.clear();pool.clear();await segmented?.clearCache();},
  async dispose(){if(disposed)return;disposed=true;if(active?.abort)active.abort();await segmented?.dispose();await this.clearCache();pool.dispose();preparation.dispose();},
  memory(){return budget.snapshot();}
 };
}
