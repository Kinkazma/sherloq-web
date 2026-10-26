import "../runtime-context.js?v=0.25.0";
/** Full SPAI browser pipeline: exact real/imag FFT preprocessing + learned ONNX graphs. */
import {readRGBWindow} from './source-window.js';
const VERSION='spai-original224-grid224-exactmask16-realfft-v1',N=224,A=N*N;
const MEAN=new Float32Array([0.485,0.456,0.406]),STD=new Float32Array([0.229,0.224,0.225]);
const INV255=Math.fround(1/255),PLANS=new Map();
let preprocessingPoolModule;
for(const n of [7,14,28,56,112,224]) {
  const count=n===7?49:n/2,cos=new Float64Array(count),sin=new Float64Array(count);
  if(n===7) for(let k=0;k<7;k++) for(let j=0;j<7;j++){const t=2*Math.PI*k*j/7;cos[k*7+j]=Math.cos(t);sin[k*7+j]=Math.sin(t);}
  else for(let k=0;k<n/2;k++){const t=2*Math.PI*k/n;cos[k]=Math.cos(t);sin[k]=Math.sin(t);}
  PLANS.set(n,{cos,sin});
}
function check(signal){if(signal?.aborted){const e=new Error('Cancelled');e.name='AbortError';throw e;}}
function normalize(v,c){return Math.fround(Math.fround(Math.fround(v)-MEAN[c])/STD[c]);}
function fftRec(ir,ii,offset,stride,n,or,oi,dest,sign){
  const {cos,sin}=PLANS.get(n);
  if(n===7){
    for(let k=0;k<7;k++){
      let re=0,im=0;
      for(let j=0;j<7;j++){const a=ir[offset+j*stride],b=ii[offset+j*stride],c=cos[k*7+j],s=sign*sin[k*7+j];re+=a*c-b*s;im+=a*s+b*c;}
      or[dest+k]=re;oi[dest+k]=im;
    }
    return;
  }
  const h=n/2;
  fftRec(ir,ii,offset,stride*2,h,or,oi,dest,sign);
  fftRec(ir,ii,offset+stride,stride*2,h,or,oi,dest+h,sign);
  for(let k=0;k<h;k++){
    const ar=or[dest+k],ai=oi[dest+k],br=or[dest+h+k],bi=oi[dest+h+k],c=cos[k],s=sign*sin[k];
    const tr=br*c-bi*s,ti=br*s+bi*c;
    or[dest+k]=ar+tr;oi[dest+k]=ai+ti;or[dest+h+k]=ar-tr;oi[dest+h+k]=ai-ti;
  }
}
function fft2(re,im,inverse=false){
  const ir=new Float64Array(N),ii=new Float64Array(N),or=new Float64Array(N),oi=new Float64Array(N),sign=inverse?1:-1,scale=inverse?1/N:1;
  for(let y=0;y<N;y++){
    for(let x=0;x<N;x++){ir[x]=re[y*N+x];ii[x]=im[y*N+x];}
    fftRec(ir,ii,0,1,N,or,oi,0,sign);
    for(let x=0;x<N;x++){re[y*N+x]=or[x]*scale;im[y*N+x]=oi[x]*scale;}
  }
  for(let x=0;x<N;x++){
    for(let y=0;y<N;y++){ir[y]=re[y*N+x];ii[y]=im[y*N+x];}
    fftRec(ir,ii,0,1,N,or,oi,0,sign);
    for(let y=0;y<N;y++){re[y*N+x]=or[y]*scale;im[y*N+x]=oi[y]*scale;}
  }
}
const LOW_MASK=new Uint8Array(A);
for(let y=0;y<N;y++)for(let x=0;x<N;x++){
  // Match generate_centered_2d_coordinates_grid and fftshift exactly, including its asymmetry.
  const sy=(y+112)%224,sx=(x+112)%224,cy=sy<112?111-sy:sy-112,cx=sx<112?111-sx:sx-112;
  LOW_MASK[y*N+x]=(cy*cy+cx*cx)<256?1:0;
}
export function spectralBranches(raw,{signal}={}){
  if(!(raw instanceof Float32Array)||raw.length!==3*A)throw new TypeError('Expected float32 NCHW RGB224² in[0,1]');
  const x=new Float32Array(3*A),x_low=new Float32Array(3*A),x_high=new Float32Array(3*A);
  for(let c=0;c<3;c++){
    check(signal);const re=new Float64Array(A),im=new Float64Array(A);
    for(let i=0;i<A;i++){re[i]=raw[c*A+i];x[c*A+i]=normalize(raw[c*A+i],c);}
    fft2(re,im);
    const hiRe=new Float64Array(re),hiIm=new Float64Array(im);
    for(let i=0;i<A;i++)if(LOW_MASK[i]){hiRe[i]=0;hiIm[i]=0;}else{re[i]=0;im[i]=0;}
    fft2(re,im,true);fft2(hiRe,hiIm,true);
    for(let i=0;i<A;i++){
      x_low[c*A+i]=normalize(Math.fround(Math.max(0,Math.min(1,re[i]))),c);
      x_high[c*A+i]=normalize(Math.fround(Math.max(0,Math.min(1,hiRe[i]))),c);
    }
  }
  return {x:{data:x,dims:[1,3,N,N],type:'float32'},x_low:{data:x_low,dims:[1,3,N,N],type:'float32'},x_high:{data:x_high,dims:[1,3,N,N],type:'float32'}};
}
function reflected(i,n){if(n===1)return 0;const period=2*(n-1);i=((i%period)+period)%period;return i<n?i:period-i;}
export function extractPatch(image,origin,padding){
  const {width,height,data}=image,channels=data.length/(width*height),[oy,ox]=origin,[top,left]=padding,raw=new Float32Array(3*A);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const sy=reflected(oy+y-top,height),sx=reflected(ox+x-left,width),at=(sy*width+sx)*channels;
    for(let c=0;c<3;c++)raw[c*A+y*N+x]=Math.fround(data[at+c]*INV255);
  }
  return raw;
}
function roundEven(v){const f=Math.floor(v),fraction=v-f;return fraction===0.5?(f%2?f+1:f):Math.round(v);}
export function windowPlan(width,height){
 const h=Math.max(height,224),w=Math.max(width,224),top=Math.floor((h-height)/2),left=Math.floor((w-width)/2),rows=Math.floor(h/224),cols=Math.floor(w/224);let origins=[];
 if(rows*cols<4)origins=[[0,0],[0,w-224],[h-224,0],[h-224,w-224],[roundEven((h-224)/2),roundEven((w-224)/2)]];
 else for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)origins.push([y*224,x*224]);
 return {origins,padding:[top,left]};
}
export async function extractPatchSource(image,origin,padding,{signal}={}){
 if(image.data)return extractPatch(image,origin,padding);
 const shortX=image.width<224,shortY=image.height<224;
 const rect={x:shortX?0:origin[1],y:shortY?0:origin[0],width:shortX?image.width:224,height:shortY?image.height:224};
 const window=await readRGBWindow(image,rect,{signal});
 let raw,failure;
 try{raw=extractPatch(window.pixels,[shortY?origin[0]:0,shortX?origin[1]:0],[shortY?padding[0]:0,shortX?padding[1]:0]);}catch(error){failure=error;}
 try{await window.release();}catch(error){if(failure===undefined)failure=error;}
 if(failure!==undefined)throw failure;check(signal);return raw;
}
async function digestPixels(p,supplied){if(supplied)return supplied;const b=new Uint8Array(p.data.buffer,p.data.byteOffset,p.data.byteLength),h=await crypto.subtle.digest('SHA-256',b);return Array.from(new Uint8Array(h),x=>x.toString(16).padStart(2,'0')).join('');}
export async function prepare(image,{memo,signal,onProgress,digest,scheduler,budget,maxWorkers,streaming,batchSize=16,encoderBatchSize=1}={}){
  check(signal);const {width,height,data}=image,channels=data?.length/(width*height);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||(data&&(![3,4].includes(channels)||data.BYTES_PER_ELEMENT!==1)))throw new TypeError('Expected RGB/RGBA uint8 image pixels or source');
  if(!data&&!digest&&!image.sourceSha256)throw Error('Source identity required');
  const key=`${VERSION}:${width}x${height}:${await digestPixels(image,digest??image.sourceSha256)}`;
  if(memo?.has(key))return memo.get(key);
  const {origins,padding}=windowPlan(width,height),[top,left]=padding;
  if(streaming??origins.length>64){
   const prepared={method:'spai',version:VERSION,key,width,height,origins,padding,patch_count:origins.length,streaming:true,batchSize,encoderBatchSize,preprocessing:'Exact original grid and spectral branches, bounded batches; no resolution change'};
   memo?.set(key,prepared);return prepared;
  }
  const partialKey=`spai-partial:${key}`,patches=memo?.get(partialKey)??new Array(origins.length);memo?.set(partialKey,patches);let execution;
  if(scheduler&&budget&&typeof Worker==='function'){
    preprocessingPoolModule??=await import('./spai-preprocess-pool.js');
    execution=await preprocessingPoolModule.spectralPool(scheduler,budget).run(image,origins,[top,left],{maxWorkers,signal,onProgress,patches,extractPatch:extractPatchSource});
  }else{
    for(let i=0;i<origins.length;i++){
      if(patches[i])continue;
      check(signal);const raw=await extractPatchSource(image,origins[i],[top,left],{signal});
      patches[i]={feeds:spectralBranches(raw,{signal}),origin_pixels:origins[i]};
      onProgress?.({phase:'preprocess',completed:patches.filter(Boolean).length,total:origins.length});
      if(i%4===3)await new Promise(resolve=>setTimeout(resolve,0));
    }
    execution={workers:0,transport:'local'};
  }
  const prepared={method:'spai',version:VERSION,key,patches,width,height,patch_count:patches.length,encoderBatchSize,preprocessing:'Official224² grid and exact radius16 spectral mask; full real/imag FFT computed inJS',preprocessing_execution:execution};
  memo?.delete(partialKey);
  memo?.set(key,prepared);return prepared;
}
export function aggregate(logit){if(!Number.isFinite(logit))throw new TypeError('Expected finite SPAI logit');return {global_logit:logit,sigmoid_score_uncalibrated:1/(1+Math.exp(-logit)),default_logit_threshold:0,global_decision_at_default_threshold:logit>0?'ai_generated':'real'};}
export async function runPrepared(prepared,{loadSession,infer},{memo,signal,onProgress,source,scheduler,budget,maxWorkers,encoderBatchSize=prepared.encoderBatchSize??1}={}){
  check(signal);const cacheKey=`spai-embeddings:${prepared.key}`;let features=memo?.get(cacheKey);
  if(!features){
    const count=prepared.patch_count,enc=await loadSession('spai-encoder-v1','models/spai/encoder.onnx');features=new Float32Array(count*1096);
    const batch=prepared.streaming?prepared.batchSize:count;
    for(let start=0;start<count;start+=batch){
     let patches=prepared.patches,release;
     try{
      if(prepared.streaming){
       if(!source)throw Error('Streaming SPAI requires the live source');const origins=prepared.origins.slice(start,start+batch);patches=new Array(origins.length);
       release=budget?.reserve(origins.length*3*3*A*4);
       if(scheduler&&budget&&typeof Worker==='function'){
        preprocessingPoolModule??=await import('./spai-preprocess-pool.js');
        await preprocessingPoolModule.spectralPool(scheduler,budget).run(source,origins,prepared.padding,{maxWorkers,signal,onProgress,patches,extractPatch:extractPatchSource,shareSource:false});
       }else for(let j=0;j<origins.length;j++)patches[j]={feeds:spectralBranches(await extractPatchSource(source,origins[j],prepared.padding,{signal}),{signal}),origin_pixels:origins[j]};
      }
      const encoderBatch=encoderBatchSize;
      for(let j=0;j<patches.length;j+=encoderBatch){
       check(signal);const valid=Math.min(encoderBatch,patches.length-j);let feeds=patches[j].feeds;
       if(encoderBatch>1){feeds={};for(const name of ['x','x_low','x_high']){const data=new Float32Array(encoderBatch*3*A);for(let k=0;k<encoderBatch;k++)data.set(patches[j+Math.min(k,valid-1)].feeds[name].data,k*3*A);feeds[name]={data,dims:[encoderBatch,3,224,224],type:'float32'};}}
       const result=await infer(enc,feeds),tensor=result.features??Object.values(result)[0];
       if(tensor.data.length!==encoderBatch*1096)throw new Error('Unexpected SPAI feature dimension');features.set(tensor.data.subarray(0,valid*1096),(start+j)*1096);
       onProgress?.({phase:'inference',completed:start+j+valid,total:count+1,encoderBatchSize:encoderBatch});
      }
     }finally{release?.();}
    }
    memo?.set(cacheKey,features);
  }
  check(signal);const agg=await loadSession('spai-aggregator-v1','models/spai/aggregator.onnx'),result=await infer(agg,{features:{data:features,dims:[1,prepared.patch_count,1096],type:'float32'}}),tensor=result.logits??Object.values(result)[0];
  onProgress?.({phase:'inference',completed:prepared.patch_count+1,total:prepared.patch_count+1});
  return {method:'spai',status:'ok',scores:aggregate(Number(tensor.data[0])),patch_count:prepared.patch_count,preprocessing:{streaming:!!prepared.streaming,batchSize:prepared.batchSize,encoderBatchSize,paddedEncoderWindows:(encoderBatchSize-prepared.patch_count%encoderBatchSize)%encoderBatchSize},scientific_limits:['Whole-image generation score; cannot localize or exclude partialAI retouching.','The upstream grid omits incomplete bottom/right windows.','Sigmoid score is not calibrated authenticity confidence.']};
}
export {VERSION as preprocessingVersion};
export function disposePreprocessing(scheduler){preprocessingPoolModule?.disposeSpectralWorkers(scheduler);}
