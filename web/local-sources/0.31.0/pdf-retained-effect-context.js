import {equalizationPlan} from './unified-engine/src/equalization-settings.js';
import {prepareEqualization} from './unified-engine/src/equalization-presentation.js';
// Global statistics at one immutable native reference density. Every fine
// presentation window is still read from the retained display program.
import {createSegmentedBytes} from './unified-engine/src/segmented-bytes.js';
import {createRgbSurface} from './unified-engine/src/rgb-surface.js';
import {createPdfRetainedEffectStatistics} from './unified-engine/src/pdf-retained-effect-statistics.js';
import {equalizeHistogramLut} from './unified-engine/src/pixel-utils.js';
import {createCooperator} from './unified-engine/src/errors.js';
import {retireCompositeOwners} from './unified-engine/src/composite-owner-release.js';
const cancelled=()=>Object.assign(new Error('Canonical PDF effect context released.'),{code:'CANCELLED'});
const check=signal=>{if(signal?.aborted)throw signal.reason??cancelled();};
function wait(promise,signal){check(signal);if(!signal)return promise;return new Promise((resolve,reject)=>{const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason??cancelled());};signal.addEventListener('abort',abort,{once:true});promise.then(v=>{signal.removeEventListener('abort',abort);resolve(v);},e=>{signal.removeEventListener('abort',abort);reject(e);});});}
export function pdfEffectReference(width,height,density){if(![width,height].every(Number.isSafeInteger)||width<1||height<1||!Number.isFinite(density)||density<=0||!Number.isSafeInteger(width*height)||width*height>2147483647)throw new RangeError('PDF canonical effect reference cannot be admitted unchanged.');const padding=width%8!==0||height%8!==0;return Object.freeze({width,height,density,paddedWidth:padding?width+8-width%8:width,paddedHeight:padding?height+8-height%8:height});}
export function createPdfRetainedEffectContext(source,reference,adjust,{budget,math,enabled=true,getTemporarySession,storage='auto',bandRows=128,tileWidth=1024}={}){
 const plan=enabled?equalizationPlan('inspection.adjust',adjust):null;
 const grid=pdfEffectReference(reference.width,reference.height,reference.density),{width,height,paddedWidth:pw,paddedHeight:ph}=grid,a={...(plan?.base??adjust)},radius=enabled?Math.floor(a.sharpen/4):0,kind=enabled?a.equalize:0;
 if(typeof source?.readWindow!=='function'||typeof math?.localRows!=='function'||typeof budget?.reserve!=='function'||![bandRows,tileWidth].every(Number.isSafeInteger)||bandRows<1||bandRows>128||tileWidth<16||tileWidth%16)throw new TypeError('Invalid canonical PDF effect context.');
 let equalizationProgram=null,store=null,surface=null,statistics=null,tables=null,hist=null,histRelease=null,initializing=null,otsuTask=null,otsuValue=null,initialized=false,closing=false,closed=false,closeTask;
 const frames=new Set(),retiring=new Map(),controller=new AbortController();const metrics={statisticsRuns:0,statisticsPixels:0,localWindows:0,mappedBands:0};
 const alive=signal=>{check(signal);if(closing)throw cancelled();};
 function retain(frame){frames.add(frame);return frame;}
 function retire(frame){if(!frame||!frames.has(frame))return Promise.resolve();if(retiring.has(frame))return retiring.get(frame);const task=Promise.resolve().then(()=>frame.release()).then(()=>{frames.delete(frame);retiring.delete(frame);},error=>{retiring.delete(frame);throw error;});retiring.set(frame,task);return task;}
 const reflected=(v,n)=>{if(n===1)return 0;const period=2*(n-1),m=((v%period)+period)%period;return Math.min(m,period-m);};
 async function local(y,rows,signal){if(!enabled)return retain(await source.readWindow({x:0,y,width,height:rows},{signal}));let output,release,part,stage,failed=false,primary,published=false;
  try{release=budget.reserve(width*rows*3);output=new Uint8Array(width*rows*3);const cooperate=createCooperator(signal);for(let x=0;x<width;x+=tileWidth){await cooperate();alive(signal);const count=Math.min(tileWidth,width-x),left=Math.max(0,Math.floor((x-radius)/16)*16),right=x+count+radius>=Math.floor(width/16)*16?width:Math.min(width,Math.ceil((x+count+radius)/16)*16),top=Math.max(0,y-radius),bottom=Math.min(height,y+rows+radius);
    part=retain(await source.readWindow({x:left,y:top,width:right-left,height:bottom-top},{signal}));alive(signal);if(part.pixels?.format!=='rgb8'||part.pixels.width!==right-left||part.pixels.height!==bottom-top||!(part.pixels.data instanceof Uint8Array)||part.pixels.data.length!==(right-left)*(bottom-top)*3)throw new TypeError('Incomplete canonical native PDF RGB.');stage=retain(await math.localRows(part.pixels,a,y-top,rows,{signal}));alive(signal);for(let row=0;row<rows;row++){const from=(row*(right-left)+x-left)*3;output.set(stage.data.subarray(from,from+count*3),(row*width+x)*3);}await retire(stage);stage=null;await retire(part);part=null;metrics.localWindows++;
   }alive(signal);let released=false;const frame={pixels:{width,height:rows,format:'rgb8',data:output},release(){if(released)return;released=true;release();}};retain(frame);published=true;return frame;
  }catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([()=>retire(stage),()=>retire(part),()=>{if(!published)release?.();}],failed?{primary}:{});}
 }
 async function histogram(bytes,rows,y,signal){const cooperate=createCooperator(signal),tw=pw/8,th=ph/8;for(let row=0;row<rows;row++){await cooperate();for(let x=0;x<pw;x++){const value=bytes[(row*width+(x<width?x:reflected(x,width)))*3+2];if(kind===1){if(x<width)hist[value]++;}else hist[(Math.floor((y+row)/th)*8+Math.floor(x/tw))*256+value]++;}}}
 async function initialize(){const signal=controller.signal;let part,stage,failed=false,primary;try{alive(signal);metrics.statisticsRuns++;statistics=createPdfRetainedEffectStatistics({budget});
   if(plan?.post){
    store=await createSegmentedBytes(width*height*3,{budget,storage,getTemporarySession,signal,label:'pdf-equalization-prefix'});surface=createRgbSurface(store,{width,height,budget,ownsStore:false});
    for(let y=0;y<height;y+=bandRows){const count=Math.min(bandRows,height-y);part=await local(y,count,signal);await store.write(part.pixels.data,y*width*3,{signal});await retire(part);part=null;}await store.flush();
    equalizationProgram=await prepareEqualization(surface,plan,{budget,signal});
    for(let y=0;y<height;y+=bandRows){const count=Math.min(bandRows,height-y);part=retain(await surface.readWindow({x:0,y,width,height:count},{signal}));equalizationProgram.map(part.pixels.data,0,y,width,count);await statistics.append(part.pixels.data,{signal});metrics.statisticsPixels+=width*count;await retire(part);part=null;}
    await surface.dispose();surface=null;await store.dispose();store=null;statistics.seal();alive(signal);initialized=true;return;
   }
   if(kind){histRelease=budget.reserve(kind===1?256*8:16384*4);hist=kind===1?new Float64Array(256):new Int32Array(16384);store=await createSegmentedBytes(width*height*3,{budget,storage,getTemporarySession,signal,label:'pdf-canonical-adjustment-prefix'});alive(signal);surface=createRgbSurface(store,{width,height,budget,ownsStore:false});}
   for(let y=0;y<height;y+=bandRows){alive(signal);const count=Math.min(bandRows,height-y);part=await local(y,count,signal);alive(signal);if(kind){await histogram(part.pixels.data,count,y,signal);await store.write(part.pixels.data,y*width*3,{signal});}else{await statistics.append(part.pixels.data,{signal});metrics.statisticsPixels+=width*count;}await retire(part);part=null;}
   if(kind){await store.flush?.();if(kind>=2&&ph>height)for(let y=height;y<ph;y++){part=retain(await surface.readWindow({x:0,y:reflected(y,height),width,height:1},{signal}));await histogram(part.pixels.data,1,y,signal);await retire(part);part=null;}
    if(kind===1){const release=budget.reserve(256);let data;try{data=equalizeHistogramLut(hist,width*height);}catch(error){release();throw error;}tables={data,release};}else tables=await math.tables(hist,(pw/8)*(ph/8),kind,{signal});hist=null;histRelease();histRelease=null;
    const mapRows=Math.max(1,Math.min(bandRows,Math.floor((64*1024**2-4*1024**2-256*1024)/(width*48))));for(let y=0;y<height;y+=mapRows){alive(signal);const count=Math.min(mapRows,height-y);part=retain(await surface.readWindow({x:0,y,width,height:count},{signal}));stage=retain(await math.mapRows(part.pixels.data,width,count,y,pw,ph,kind,tables.data,{signal}));await statistics.append(stage.data,{signal});metrics.statisticsPixels+=width*count;metrics.mappedBands++;await retire(stage);stage=null;await retire(part);part=null;}
    await surface.dispose();surface=null;await store.dispose();store=null;
   }
   if(statistics.count!==width*height)throw new Error('Incomplete canonical PDF statistics population.');statistics.seal();alive(signal);initialized=true;
  }catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([()=>retire(stage),()=>retire(part)],failed?{primary}:{});}}
 return{reference:grid,adjust:Object.freeze({...a}),enabled,
  get equalizationProgram(){return equalizationProgram;},
  presentationSurface({threshold=255,invert=false}={}){return{descriptor:{width,height},async readWindow(rect,{signal}={}){
   if(!initialized)throw new Error('PDF effect context is not ready.');const {x=0,y=0,width:w=width,height:h=height}=rect;let part,stage,release,published=false;
   try{part=await local(y,h,signal);let data=part.pixels.data;
    if(kind){stage=retain(await math.mapRows(data,width,h,y,pw,ph,kind,tables.data,{signal}));data=stage.data;}else equalizationProgram?.map(data,0,y,width,h);
    release=budget.reserve(w*h*3);const out=new Uint8Array(w*h*3);for(let row=0;row<h;row++)for(let xx=0;xx<w;xx++)for(let c=0;c<3;c++){let v=data[(row*width+x+xx)*3+c];if(threshold<255)v=v>threshold?255:0;out[(row*w+xx)*3+c]=invert?255-v:v;}alive(signal);published=true;return{pixels:{width:w,height:h,format:'rgb8',data:out},release};
   }finally{await retire(stage);await retire(part);if(!published)release?.();}
  }};},
  async ready({signal}={}){alive(signal);initializing??=initialize();initializing.catch(()=>{});await wait(initializing,signal);alive(signal);},
  async threshold({signal}={}){alive(signal);if(!initialized)throw new Error('PDF effect context is not ready.');if(otsuValue!==null)return otsuValue;otsuTask??=(async()=>{let sample,failed=false,primary;try{sample=retain(statistics.grayHistogram());const value=await math.otsu(sample.data,width*height,{signal:controller.signal});alive(controller.signal);otsuValue=value;return value;}catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([()=>retire(sample)],failed?{primary}:{});}})();otsuTask.catch(()=>{});const value=await wait(otsuTask,signal);alive(signal);return value;},
  get tables(){if(!initialized)throw new Error('PDF effect context is not ready.');return tables?.data??null;},
  get statistics(){if(!initialized)throw new Error('PDF effect context is not ready.');return statistics;},
  get metrics(){return{...metrics,reference:grid,initialized,pendingFrames:frames.size,hasTemporaryPrefix:!!store,closing,closed};},
  close(){if(closed)return Promise.resolve();if(closeTask)return closeTask;closing=true;controller.abort(cancelled());closeTask=(async()=>{await initializing?.catch(()=>{});await otsuTask?.catch(()=>{});await retireCompositeOwners([...frames].map(frame=>()=>retire(frame)));if(surface){await surface.dispose();surface=null;}if(store){await store.dispose();store=null;}await statistics?.close();statistics=null;equalizationProgram?.dispose();equalizationProgram=null;if(tables){await tables.release();tables=null;}hist=null;histRelease?.();histRelease=null;closed=true;})();closeTask.then(()=>{},()=>{closeTask=null;});return closeTask;}
 };
}
