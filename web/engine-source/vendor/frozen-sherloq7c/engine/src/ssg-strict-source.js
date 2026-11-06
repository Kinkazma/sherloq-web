import {createSsgSourceTaskOwner} from './ssg-source-task-owner.js';
import {attachSsgNormalizationObservation,ssgNormalizationObservation} from './ssg-normalization-observer.js';
const qualifiedPreparedSources=new WeakSet();export const isSsgStrictPreparedSource=source=>qualifiedPreparedSources.has(source);
import {ssgFullParams,ssgResizeCoefficients} from './ssg-full-input.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {requireValue,checkAbort,createCooperator,EngineError} from './errors.js';

/** The native global normalization grid stays common to every context. A hole
 * is never a black RGB observation: cubic taps are read only when admitted.
 * Incomplete support is normalized explicitly; complete support uses the exact
 * native arithmetic, including its reflected outer-image taps. */
async function createSsgStrictSourceBody(view,input,{budget,signal},tasks){
 const deepFreeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))deepFreeze(x);Object.freeze(v);}return v;},p=deepFreeze(ssgFullParams(structuredClone(input))),domain=view?.domain;
 requireValue(domain&&typeof view.admittedRectangles==='function'&&budget,'A certified SSG source domain and shared budget are required.');
 checkAbort(signal);const sourceWidth=domain.width,sourceHeight=domain.height,scale=p.normalizationLongEdge?Math.max(1,p.normalizationLongEdge/Math.max(sourceWidth,sourceHeight)):1,width=Math.ceil(sourceWidth*scale),height=Math.ceil(sourceHeight*scale);
 requireValue([width,height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=32768),'SSG normalization exceeds its native VLFeat grid.');
 const scaleX=width/sourceWidth,scaleY=height/sourceHeight,metadata=budget.reserve(65536+(width+height)*768),leases=[],contexts=[],cooperate=createCooperator(signal),authorized=new WeakSet();let returned=false,closed=false,active=0,finish,disposal;
 try{
  const xs=ssgResizeCoefficients(sourceWidth,width),ys=ssgResizeCoefficients(sourceHeight,height);let bands=new Map();
  const emit=rect=>{leases.push(budget.reserve(2048));contexts.push(rect);};
  for(let y=0;y<height;y++){
   await cooperate();const rawY=Math.min(sourceHeight-1,Math.floor((y+.5)/scaleY)),next=new Map();
   for(const[a,b]of domain.rowIntervals(rawY)){
    const left=Math.max(0,Math.ceil(a*scaleX-.5)),right=Math.min(width,Math.ceil(b*scaleX-.5));if(right<=left)continue;
    const key=left+':'+right,prior=bands.get(key);next.set(key,prior?{...prior,height:prior.height+1}:{x:left,y,width:right-left,height:1});
   }
   for(const[key,rect]of bands)if(!next.has(key))emit(rect);bands=next;
  }
  for(const rect of bands.values())emit(rect);
  contexts.sort((a,b)=>a.y-b.y||a.x-b.x||a.height-b.height||a.width-b.width);for(let i=0;i<contexts.length;i++){const rect=contexts[i],context=Object.freeze({...rect,index:i,bounds:Object.freeze([rect.x,rect.y,rect.x+rect.width,rect.y+rect.height])});authorized.add(context);contexts[i]=context;}
  const observation=globalThis.__privateSsgNormalizationObserver?.openSource(()=>({sourceSha256:domain.sourceSha256,domainFingerprint:domain.fingerprint,sourceWidth,sourceHeight,width,height,scaleX,scaleY,origin:[...domain.origin],normalizationLongEdge:p.normalizationLongEdge,contextCount:contexts.length}),budget);
  const wait=()=>active?new Promise(resolve=>finish=resolve):Promise.resolve();
  async function read(context,{signal:currentSignal,normalizationConsumer='unlabeled',readCooperator}={}){
   requireValue(!closed&&authorized.has(context),'SSG context is closed or belongs to another owner.');checkAbort(currentSignal);active++;const observed=observation?.begin(context,normalizationConsumer),readMetrics=observed?.row;let observedAt=performance.now();
   const windows=[],rows=new Map(),rowLeases=[],readCooperate=readCooperator??createCooperator(currentSignal);let rgb,gray,complete=false,primary,failed=false;
   try{
    rgb=allocateOwnedTypedArray(Uint8Array,context.width*context.height*3,{budget,owner:'ssg-strict-input',label:'admitted common-grid RGB'});gray=allocateOwnedTypedArray(Float64Array,context.width*context.height,{budget,owner:'ssg-strict-input',label:'admitted common-grid grayscale'});
    if(readMetrics)readMetrics.allocationMs=performance.now()-observedAt;
    const xTaps=xs.slice(context.x,context.x+context.width),yTaps=ys.slice(context.y,context.y+context.height);let left=sourceWidth,right=0,top=sourceHeight,bottom=0;for(const tap of xTaps)for(const id of tap.ids){left=Math.min(left,id);right=Math.max(right,id+1);}for(const tap of yTaps)for(const id of tap.ids){top=Math.min(top,id);bottom=Math.max(bottom,id+1);}
    observedAt=performance.now();
    for(const rect of view.admittedRectangles({x:left,y:top,width:right-left,height:bottom-top})){
     const max=view.maxReadPixels??262144,step=Math.min(rect.width,max);
     for(let x=rect.x;x<rect.x+rect.width;x+=step){const w=Math.min(step,rect.x+rect.width-x),rowStep=Math.max(1,Math.floor(max/w));for(let y=rect.y;y<rect.y+rect.height;y+=rowStep){checkAbort(currentSignal);const h=Math.min(rowStep,rect.y+rect.height-y),part=await(async()=>{const start=performance.now();try{return await view.readWindow({x,y,width:w,height:h},{signal:currentSignal});}finally{if(readMetrics)readMetrics.sourceReadAwaitMs+=performance.now()-start;}})();if(readMetrics){readMetrics.sourceWindowCount++;readMetrics.sourceWindowBytes+=part.pixels.data.byteLength;}windows.push(part);rowLeases.push(budget.reserve(h*96));for(let k=0;k<h;k++){const cells=rows.get(y+k)??[];cells.push({x,right:x+w,data:part.pixels.data,offset:k*w*3});rows.set(y+k,cells);}}}
    }
    if(readMetrics)readMetrics.sourceWindowMs=performance.now()-observedAt;
    for(const spans of rows.values())spans.sort((a,b)=>a.x-b.x);const at=(x,y)=>{const spans=rows.get(y)??[];let a=0,b=spans.length;while(a<b){const m=(a+b)>>>1,span=spans[m];if(x<span.x)b=m;else if(x>=span.right)a=m+1;else return span;}return null;};let incomplete=0,nearestFallback=0;
    observedAt=performance.now();
    for(let y=0;y<context.height;y++){checkAbort(currentSignal);if(readMetrics){const start=performance.now();await readCooperate();readMetrics.cooperationMs+=performance.now()-start;}else await readCooperate();for(let x=0;x<context.width;x++){
     const xx=xTaps[x],yy=yTaps[y];let r=0,g=0,b=0,l=0,sum=0,all=true;
     for(let j=0;j<yy.ids.length;j++)for(let i=0;i<xx.ids.length;i++){const cell=at(xx.ids[i],yy.ids[j]),w=yy.weights[j]*xx.weights[i];if(!cell){all=false;continue;}const v=cell.data,k=cell.offset+(xx.ids[i]-cell.x)*3;r+=v[k]*w;g+=v[k+1]*w;b+=v[k+2]*w;l+=Math.round(.298936021293775*v[k]+.587043074451121*v[k+1]+.114020904255103*v[k+2])*w;sum+=w;}
     if(!all){incomplete++;if(Math.abs(sum)>1e-14){r/=sum;g/=sum;b/=sum;l/=sum;}else{nearestFallback++;const rawX=Math.min(sourceWidth-1,Math.floor((context.x+x+.5)/scaleX)),rawY=Math.min(sourceHeight-1,Math.floor((context.y+y+.5)/scaleY)),cell=at(rawX,rawY);requireValue(cell,'An admitted SSG output center lost its nearest admitted source pixel.');const v=cell.data,k=cell.offset+(rawX-cell.x)*3;r=v[k];g=v[k+1];b=v[k+2];l=Math.round(.298936021293775*r+.587043074451121*g+.114020904255103*b);}}
     const n=y*context.width+x;rgb.data[n*3]=Math.max(0,Math.min(255,Math.round(r)));rgb.data[n*3+1]=Math.max(0,Math.min(255,Math.round(g)));rgb.data[n*3+2]=Math.max(0,Math.min(255,Math.round(b)));gray.data[n]=l;
    }}
    if(readMetrics)readMetrics.interpolationMs=performance.now()-observedAt;
    checkAbort(currentSignal);requireValue(!closed,'SSG context source retired during a read.');complete=true;let released=false;return{rgb:rgb.data,gray:gray.data,width:context.width,height:context.height,analysisOrigin:[context.x,context.y],scaleX,scaleY,originalWidth:sourceWidth,originalHeight:sourceHeight,metadata:{sourceDomain:domain.fingerprint,normalizationLongEdge:p.normalizationLongEdge,incompleteCubicSupportPixels:incomplete,nearestAdmittedFallbackPixels:nearestFallback,policy:'native global cubic coefficients; missing admitted support normalized before VLFeat or forest input'},release(){if(released)return;released=true;rgb.release();gray.release();}};
   }catch(error){failed=true;primary=error;throw error;}finally{const retirementStarted=performance.now(),errors=[];for(const part of windows)try{await part.release();}catch(error){errors.push(error);}for(const lease of rowLeases)lease();if(!complete||errors.length){rgb?.release();gray?.release();}active--;if(!active){finish?.();finish=undefined;}try{observed?.finish({retirementMs:performance.now()-retirementStarted,computedComplete:complete,failed,retirementFailures:errors.length});}catch{}if(errors.length){if(failed){if(primary&&typeof primary==='object'&&Object.isExtensible(primary))primary.ssgCleanupErrors=errors;}else throw new AggregateError(errors,'SSG source window retirement failed.');}}
  }
  const result=Object.freeze({width,height,sourceWidth,sourceHeight,scaleX,scaleY,sourceSha256:domain.sourceSha256,origin:Object.freeze([...domain.origin]),contexts:Object.freeze(contexts),parameters:p,read,dispose(){if(disposal)return disposal;closed=true;disposal=(async()=>{await wait();for(const release of leases)release();metadata();})();return disposal;}});tasks.installSource(()=>result.dispose());returned=true;qualifiedPreparedSources.add(result);attachSsgNormalizationObservation(result,observation);return result;
 }finally{if(!returned){for(const release of leases)release();metadata();}}
}

// The source parent is adopted before construction, including the no-cache and
// old-timer fallback paths. Seal before awaiting close avoids a constructor cycle.
export async function createSsgStrictSource(view,input={},options={}){
 const tasks=createSsgSourceTaskOwner(options);let failed=false,primary;
 try{
  const raw=await createSsgStrictSourceBody(view,input,{...options,signal:tasks.signal},tasks);
  const result=Object.freeze({...raw,read(context,readOptions={}){return tasks.read(readOptions.signal,selected=>raw.read(context,{...readOptions,signal:selected,readCooperator:tasks.cooperator(selected)}));},dispose:()=>tasks.dispose()});
  qualifiedPreparedSources.add(result);attachSsgNormalizationObservation(result,ssgNormalizationObservation(raw));checkAbort(tasks.signal);return result;
 }catch(error){failed=true;primary=error;throw error;}
 finally{tasks.seal();if(failed)try{await tasks.dispose();}catch(cleanup){if(primary!==null&&(typeof primary==='object'||typeof primary==='function')&&Object.isExtensible(primary))try{primary.ssgTaskRetirementError=cleanup;}catch{}}}
}
