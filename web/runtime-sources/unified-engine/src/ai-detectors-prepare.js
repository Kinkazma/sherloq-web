import "../../runtime-context.js?v=0.31.0";
// Exact method geometry; separable PIL-compatible RGB8 filtering before FP32
// normalization. The source is the host's oriented, immutable RGB8 surface.
// Algorithm reference: Pillow 12.2.0 libImaging/Resample.c (Pillow license).
export const AI_PREPARATION_VERSION = 'rgb8-pil22-v1';
export const AI_METHODS = Object.freeze(['dda','prl','community-forensics','gapl']);
const IMAGENET = [[0.485,0.456,0.406],[0.229,0.224,0.225]];
const CLIP = [[0.48145466,0.4578275,0.40821073],[0.26862954,0.26130258,0.27577711]];
const Q = 2**22;
const fail = message => { throw Object.assign(new Error(message),{code:'INVALID_INPUT'}); };
function abort(signal){if(signal?.aborted)throw Object.assign(new Error('AI detection cancelled.'),{code:'CANCELLED'});}
export function roundEven(x){const n=Math.floor(x),d=x-n;return d===0.5?n+(n%2):Math.round(x);}

export function aiPreparationPlan(method,width,height){
 if(!AI_METHODS.includes(method)||![width,height].every(n=>Number.isSafeInteger(n)&&n>0)||!Number.isSafeInteger(width*height*3))fail('Invalid AI preparation source.');
 const size=method==='gapl'?224:method==='community-forensics'?384:336;
 let rw=width,rh=height,filter=null;
 if(method==='community-forensics'){
  if(width<=height){rw=440;rh=Math.trunc(440*height/width);}else{rh=440;rw=Math.trunc(440*width/height);}filter='bilinear';
 }else if(method==='prl'&&width>1024&&height>1024){
  const scale=336/Math.min(width,height);rw=Math.max(336,roundEven(width*scale));rh=Math.max(336,roundEven(height*scale));filter='bicubic';
 }
 if(![rw,rh].every(n=>Number.isSafeInteger(n)&&n>0))fail('AI preparation geometry exceeds safe dimensions.');
 const px=Math.floor(Math.max(0,size-rw)/2),py=Math.floor(Math.max(0,size-rh)/2);
 const cropX=roundEven((Math.max(rw,size)-size)/2)-px,cropY=roundEven((Math.max(rh,size)-size)/2)-py;
 // The scratch allowance includes coefficient objects, one source row, a
 // horizontal row and the vertical accumulator. It excludes the owned source.
 const support=filter==='bicubic'?2:1;
 const coeffBytes=filter?size*(Math.ceil(support*Math.max(width/rw,height/rh,1))*2+1)*32:0;
 const rowCacheMaxRows=filter?Math.min(height,Math.ceil(2*support*Math.max(height/rh,1))+2):0;
 const rowCacheBytes=rowCacheMaxRows*size*3;
 const scratchBytes=Math.ceil(coeffBytes+rowCacheBytes+width*3+size*3*16+size*size*3*5+65536);
 if(!Number.isSafeInteger(scratchBytes)||scratchBytes<=0)fail('AI preparation scratch exceeds safe accounting.');
 return{method,width,height,size,resizedWidth:rw,resizedHeight:rh,cropX,cropY,filter,scratchBytes,rowCacheMaxRows,rowCacheBytes,normalization:(method==='dda'?CLIP:IMAGENET).map(values=>values.slice()),version:AI_PREPARATION_VERSION};
}
function weight(x,filter){
 x=Math.abs(x);
 if(filter==='bilinear')return x<1?1-x:0;
 if(x<1)return ((1.5*x-2.5)*x)*x+1;
 return x<2?-0.5*(((x-5)*x+8)*x-4):0;
}
function coefficients(input,output,index,filter){
 if(index<0||index>=output)return null;
 if(input===output)return{start:index,values:new Int32Array([Q])};
 const scale=input/output,fs=Math.max(scale,1),support=(filter==='bicubic'?2:1)*fs,center=(index+0.5)*scale;
 const start=Math.max(0,Math.trunc(center-support+0.5)),end=Math.min(input,Math.trunc(center+support+0.5));
 const values=new Int32Array(end-start);let sum=0;
 for(let i=start;i<end;i++)sum+=weight((i-center+0.5)/fs,filter);
 for(let i=start;i<end;i++){const v=weight((i-center+0.5)/fs,filter)/sum*Q;values[i-start]=Math.trunc(v+(v<0?-0.5:0.5));}
 return{start,values};
}
const clip = n=>Math.min(255,Math.max(0,Math.floor(n/Q)));

export async function prepareAiTensor(source,method,{signal,onProgress,checkpoint=async()=>{},cacheRows=true}={}){
 const p=aiPreparationPlan(method,source.width,source.height),s=p.size;
 const rgb=new Uint8Array(s*s*3),xs=Array.from({length:s},(_,x)=>coefficients(p.width,p.resizedWidth,x+p.cropX,p.filter));
 const rowCacheEnabled=!!(cacheRows&&p.filter),cache=new Map();let windows=0,maxWindowBytes=0,horizontalRows=0,failed=false,primary,rowCacheHits=0,peakRowCacheRows=0;
 const retirementErrors=[];
 const pending=new Set();
 const valid=xs.filter(Boolean),left=Math.min(...valid.map(c=>c.start)),right=Math.max(...valid.map(c=>c.start+c.values.length));
 async function horizontal(y){
  if(rowCacheEnabled&&cache.has(y)){rowCacheHits++;return cache.get(y);}
  abort(signal);let owner,calculationFailed=false;const row=new Uint8Array(s*3);
  try{
   owner=await source.readWindow({x:left,y,width:right-left,height:1},{signal});pending.add(owner);
   const pixels=owner?.pixels,data=pixels?.data;
   if(!(data instanceof Uint8Array)||pixels.width!==right-left||pixels.height!==1||data.length!==(right-left)*3||typeof owner.release!=='function')fail('Invalid RGB8 source window.');
   windows++;maxWindowBytes=Math.max(maxWindowBytes,data.byteLength);horizontalRows++;
   for(let x=0;x<s;x++){const c=xs[x];if(!c)continue;
    for(let k=0;k<3;k++){let sum=Q/2;for(let i=0;i<c.values.length;i++)sum+=data[(c.start-left+i)*3+k]*c.values[i];row[x*3+k]=clip(sum);}
   }
  }catch(error){calculationFailed=true;throw error;}
  finally{if(owner)try{await owner.release();pending.delete(owner);}catch(error){if(!calculationFailed)throw error;retirementErrors.push(error);}}
  if(rowCacheEnabled){if(cache.size>=p.rowCacheMaxRows)fail('AI horizontal row cache exceeded its admitted bound.');cache.set(y,row);peakRowCacheRows=Math.max(peakRowCacheRows,cache.size);}return row;
 }
 try{
  for(let y=0;y<s;y++){
   abort(signal);await checkpoint(signal);
   const cy=coefficients(p.height,p.resizedHeight,y+p.cropY,p.filter);
   if(cy){
    // Vertical support advances monotonically. Retire stale rows before
    // reading the next support so retained rows never exceed one kernel.
    if(rowCacheEnabled)for(const key of cache.keys())if(key<cy.start||key>=cy.start+cy.values.length)cache.delete(key);
    const sums=new Float64Array(s*3);sums.fill(Q/2);
    for(let j=0;j<cy.values.length;j++){const row=await horizontal(cy.start+j),w=cy.values[j];for(let i=0;i<row.length;i++)sums[i]+=row[i]*w;}
    for(let i=0;i<sums.length;i++)rgb[y*s*3+i]=clip(sums[i]);
   }
   if(y%16===0)onProgress?.({phase:'ai-prepare',completed:y,total:s});
  }
  const tensor=new Float32Array(3*s*s),[means,stds]=p.normalization;
  // ToTensor divides FP32 then Normalize subtracts/divides separately in FP32.
  for(let c=0;c<3;c++){const mean=Math.fround(means[c]),std=Math.fround(stds[c]);for(let i=0;i<s*s;i++)tensor[c*s*s+i]=Math.fround(Math.fround(Math.fround(rgb[i*3+c]/255)-mean)/std);}
  abort(signal);return{data:tensor,dims:[1,3,s,s],rgb,plan:p,metrics:{windows,maxWindowBytes,horizontalRows,rowCacheEnabled,rowCacheHits,peakRowCacheRows,peakRowCacheBytes:peakRowCacheRows*s*3,temporaryStorageBytes:0}};
 }catch(error){failed=true;primary=error;throw error;}
 finally{
  cache.clear();for(const owner of [...pending])try{await owner.release();pending.delete(owner);}catch(error){retirementErrors.push(error);}
  if(retirementErrors.length){
   const error=new AggregateError(failed?[primary,...retirementErrors]:retirementErrors,failed?(primary?.message??String(primary)):'RGB window retirement failed.',failed?{cause:primary}:undefined);
   error.code=failed?(primary?.code??'AI_PREPARATION_ERROR'):'AI_RETIREMENT_ERROR';error.cleanupErrors=retirementErrors;throw error;
  }
 }
}
