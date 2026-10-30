import "../../runtime-context.js?v=0.30.0";
import {wasmAllocationFailure,nativeModuleFailure} from './allocation.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
export const PDF_RETAINED_ADJUST_HEAP_BYTES=64*1024**2;
export const pdfRetainedAdjustWorkspace=(width,height)=>width*height*48+4*1024**2+256*1024;
const keys=['brightness','saturation','hue','gamma','shadows','highlights','sweep','width','sharpen','threshold','equalize','invert'];
const limits=[[-255,255],[-255,255],[0,180],[1,50],[-100,100],[-100,100],[0,255],[0,255],[0,100],[0,255],[0,5],[0,1]];
const cancelled=()=>new EngineError('CANCELLED','Retained PDF adjustment released.');
function parameters(value){const p=Float64Array.from(keys,key=>Number(value[key]));requireValue(p.every((v,i)=>Number.isInteger(v)&&v>=limits[i][0]&&v<=limits[i][1]),'Invalid retained PDF adjustment parameters.');return p;}
function rgb(value){requireValue(value?.data instanceof Uint8Array&&[value.width,value.height].every(Number.isSafeInteger)&&value.width>0&&value.height>0&&value.data.length===value.width*value.height*3,'Invalid retained PDF RGB window.');requireValue(pdfRetainedAdjustWorkspace(value.width,value.height)<=PDF_RETAINED_ADJUST_HEAP_BYTES,'Retained PDF adjustment window exceeds its fixed native heap.');}
// The private native instance belongs to this Budget owner, not a module-global
// promise. Every returned typed array has its own independent reservation.
export function createPdfRetainedAdjustMath({budget,load=async()=>{const {default:create}=await import('../vendor/pdf-retained-adjust/adjust.js');return create();}}={}){
 requireValue(typeof budget?.reserve==='function'&&typeof load==='function','A retained PDF adjustment Budget is required.');
 let module=null,heapRelease=null,loading=null,closing=false,closed=false,closeTask=null,queue=Promise.resolve();
 const metrics={nativeCalls:0,loads:0,outputBytes:0,heapBytes:0};
 function alive(signal){checkAbort(signal);if(closing)throw cancelled();}
 function withParameters(p,run){const credit=budget.reserve(12*8);try{const params=parameters(p);return Promise.resolve(run(params)).finally(credit);}catch(error){credit();throw error;}}
 async function instance(signal){alive(signal);if(module)return module;
  if(!loading){if(typeof budget.reclaim==='function'&&budget.limit>=PDF_RETAINED_ADJUST_HEAP_BYTES&&budget.total()+PDF_RETAINED_ADJUST_HEAP_BYTES>budget.limit)await budget.reclaim(PDF_RETAINED_ADJUST_HEAP_BYTES,{signal,owner:'pdf-retained-adjust-heap'});alive(signal);heapRelease=budget.reserve(PDF_RETAINED_ADJUST_HEAP_BYTES);metrics.heapBytes=PDF_RETAINED_ADJUST_HEAP_BYTES;metrics.loads++;
   loading=Promise.resolve().then(async()=>{try{const value=await load();requireValue(value?.HEAPU8?.buffer.byteLength===PDF_RETAINED_ADJUST_HEAP_BYTES,'Retained adjustment native heap differs from its admitted size.');module=value;return value;}catch(cause){heapRelease?.();heapRelease=null;metrics.heapBytes=0;throw nativeModuleFailure(cause,'Retained PDF adjustment arithmetic could not load.');}finally{loading=null;}});
  }
  const value=await loading;alive(signal);return value;
 }
 async function invoke(inputs,length,run,{signal}={},Type=Uint8Array){
  alive(signal);const execute=async()=>{alive(signal);await controlCheckpoint(signal);const m=await instance(signal);alive(signal);let output=0,outputRelease=null,owned=null;const pointers=[];
   try{if(length)outputRelease=budget.reserve(length);for(const input of inputs){if(!input.byteLength){pointers.push(0);continue;}const pointer=m._malloc(input.byteLength);if(!pointer)throw wasmAllocationFailure(m,'Retained PDF adjustment staging exceeds its fixed heap.',input.byteLength);pointers.push(pointer);m.HEAPU8.set(new Uint8Array(input.buffer,input.byteOffset,input.byteLength),pointer);}
    if(length){output=m._malloc(length);if(!output)throw wasmAllocationFailure(m,'Retained PDF adjustment output exceeds its fixed heap.',length);}
    const status=run(m,pointers,output);metrics.nativeCalls++;alive(signal);if(!length)return status;
    if(status!==1)throw status===-1?wasmAllocationFailure(m,'Retained PDF adjustment working set was refused.'):new EngineError('INVALID_INPUT','Retained PDF adjustment native input was refused.');
    owned=new Type(length/Type.BYTES_PER_ELEMENT);new Uint8Array(owned.buffer).set(m.HEAPU8.subarray(output,output+length));alive(signal);const release=outputRelease;outputRelease=null;metrics.outputBytes+=length;let released=false;
    return{data:owned,release(){if(released)return;released=true;metrics.outputBytes-=length;release();},get released(){return released;}};
   }finally{for(const pointer of pointers)if(pointer)m._free(pointer);if(output)m._free(output);outputRelease?.();}
  };
  const task=queue.then(execute,execute);queue=task.then(()=>{},()=>{});return task;
 }
 return{metrics,
  localRows(image,p,start,rows,hooks={}){rgb(image);requireValue(Number.isSafeInteger(start)&&Number.isSafeInteger(rows)&&start>=0&&rows>0&&start+rows<=image.height,'Invalid retained adjustment row range.');return withParameters(p,params=>invoke([image.data,params],image.width*rows*3,(m,[a,b],out)=>m._adjust_local_rows(a,image.width,image.height,start,rows,b,out),hooks));},
  blurRows(image,start,rows,radius,hooks={}){rgb(image);requireValue([start,rows,radius].every(Number.isSafeInteger)&&start>=0&&rows>0&&start+rows<=image.height&&radius>0&&radius<=25,'Invalid canonical Gaussian rows.');return invoke([image.data],image.width*rows*3,(m,[a],out)=>m._pdf_adjust_blur_rows(a,image.width,image.height,start,rows,radius,out),hooks);},
  finePrefix(image,blur,xs,ys,reference,p,tables,hooks={}){rgb(image);return withParameters(p,params=>{const {width,height,paddedWidth,paddedHeight}=reference;requireValue([width,height,paddedWidth,paddedHeight].every(Number.isSafeInteger)&&width>0&&height>0&&paddedWidth>=width&&paddedWidth<=width+8&&paddedWidth%8===0&&paddedHeight>=height&&paddedHeight<=height+8&&paddedHeight%8===0,'Invalid canonical adjustment geometry.');requireValue(xs instanceof Int32Array&&xs.length===image.width&&xs.every(x=>x>=0&&x<width)&&ys instanceof Int32Array&&ys.length===image.height&&ys.every(y=>y>=0&&y<height),'Invalid canonical adjustment positions.');requireValue(!Math.floor(params[8]/4)||(blur instanceof Uint8Array&&blur.length===image.data.length),'Missing canonical Gaussian neighborhood.');requireValue(!params[10]||(tables instanceof Uint8Array&&tables.length===(params[10]===1?256:16384)),'Missing canonical adjustment tables.');return invoke([image.data,blur??new Uint8Array(0),xs,ys,params,tables??new Uint8Array(0)],image.data.length,(m,[a,b,x,y,par,t],out)=>m._pdf_adjust_fine_prefix(a,b,image.width,image.height,x,y,width,height,paddedWidth,paddedHeight,par,t,out),hooks);});},
  tileHistogram(bytes,width,rows,y,pw,ph,hooks={}){requireValue(bytes instanceof Uint8Array&&bytes.length===width*rows*3&&[width,rows,y,pw,ph].every(Number.isSafeInteger)&&width>0&&rows>0&&y>=0&&y+rows<=ph&&pw>=width&&pw<=width+8&&pw%8===0&&ph>0&&ph%8===0,'Invalid canonical CLAHE histogram geometry.');return invoke([bytes],65536,(m,[a],out)=>m._adjust_tile_histogram(a,width,rows,y,pw,ph,out),hooks,Int32Array);},
  tables(hist,area,level,hooks={}){requireValue(hist instanceof Int32Array&&hist.length===16384&&Number.isSafeInteger(area)&&area>0&&area<=2147483647&&Number.isInteger(level)&&level>=2&&level<=5,'Invalid canonical CLAHE tables.');for(let tile=0;tile<64;tile++)requireValue(hist.subarray(tile*256,(tile+1)*256).every(v=>v>=0)&&hist.subarray(tile*256,(tile+1)*256).reduce((a,b)=>a+b,0)===area,'Incomplete canonical CLAHE histogram.');return invoke([hist],16384,(m,[a],out)=>m._adjust_tables(a,area,level,out),hooks);},
  mapRows(bytes,width,rows,y,pw,ph,kind,tables,hooks={}){requireValue(bytes instanceof Uint8Array&&bytes.length===width*rows*3&&[width,rows,y,pw,ph].every(Number.isSafeInteger)&&width>0&&rows>0&&y>=0&&y+rows<=ph&&pw>=width&&pw%8===0&&ph>0&&ph%8===0&&[1,2,3,4,5].includes(kind)&&tables instanceof Uint8Array&&tables.length===(kind===1?256:16384)&&pdfRetainedAdjustWorkspace(width,rows)<=PDF_RETAINED_ADJUST_HEAP_BYTES,'Invalid canonical CLAHE display.');return invoke([bytes,tables],bytes.length,(m,[a,t],out)=>m._adjust_map_rows(a,width,rows,y,pw,ph,kind,t,out),hooks);},
  otsu(hist,count,hooks={}){requireValue(hist instanceof Int32Array&&hist.length===256&&Number.isSafeInteger(count)&&count>0&&count<=2147483647&&hist.every(v=>v>=0)&&hist.reduce((a,b)=>a+b,0)===count,'Invalid canonical Otsu histogram.');return invoke([hist],0,(m,[a])=>m._adjust_otsu(a,count),hooks);},
  close(){if(closed)return Promise.resolve();if(closeTask)return closeTask;closing=true;closeTask=(async()=>{await queue;module=null;loading=null;heapRelease?.();heapRelease=null;metrics.heapBytes=0;closed=true;})();closeTask.catch(()=>{closeTask=null;});return closeTask;}
 };
}
