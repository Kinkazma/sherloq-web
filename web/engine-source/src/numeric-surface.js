import {sampleStoredPixels} from './display-sampling.js';
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {allocateOwnedTypedArray} from './allocation.js';
// Scientific stores already use oriented, full-resolution image coordinates.
// Window data is owned by the caller; no writable view of cached stores escapes.
export function createNumericSurface(store,{width,height,format,budget,semantics,dispose=()=>store.dispose()}={}){
 const Type=({float32:Float32Array,float64:Float64Array,int32:Int32Array})[format],elementBytes=Type?.BYTES_PER_ELEMENT;
 requireValue([width,height].every(n=>Number.isSafeInteger(n)&&n>0)&&Number.isSafeInteger(width*height*elementBytes)&&store.byteLength===width*height*elementBytes&&Type&&budget&&typeof semantics==='string','Scientific plane geometry, type and semantics required.');
 const id=crypto.randomUUID();let closed=false,disposing;
 const yieldReads=createCooperator();
 const alive=()=>{if(closed)throw new EngineError('DISPOSED','Scientific surface disposed.');};
 return {descriptor:Object.freeze({id,revision:1,width,height,format,semantics,coordinates:'full-resolution',storage:store.storage??'segmented'}),
  readSampledWindow(tile,options={}){alive();return sampleStoredPixels(store,{width,height,format},tile,{budget,...options,alive});},
  async readWindow({x=0,y=0,width:w=width,height:h=height}={}, {signal}={}){
   alive();checkAbort(signal);requireValue([x,y,w,h].every(Number.isSafeInteger)&&x>=0&&y>=0&&w>0&&h>0&&x<=width-w&&y<=height-h,'Scientific window is outside the full-resolution surface.');const output=allocateOwnedTypedArray(Type,w*h,{budget,label:'scientific-window'}),release=()=>output.release();
   const cooperate=async()=>{checkAbort(signal);await yieldReads();checkAbort(signal);};
   try{const data=output.data,bytes=new Uint8Array(data.buffer);if(x===0&&w===width){for(let at=0;at<bytes.length;at+=1024**2){await cooperate();alive();await store.readInto(bytes.subarray(at,Math.min(bytes.length,at+1024**2)),y*width*elementBytes+at);}}
    else for(let row=0;row<h;row++){if(row%32===0){await cooperate();alive();}await store.readInto(bytes.subarray(row*w*elementBytes,(row+1)*w*elementBytes),((y+row)*width+x)*elementBytes);}
    alive();checkAbort(signal);return {surfaceId:id,revision:1,origin:[x,y],pixels:{width:w,height:h,format,data},release};
   }catch(error){release();throw error;}
  },
  dispose(){if(disposing)return disposing;closed=true;disposing=Promise.resolve().then(dispose);return disposing;}
 };
}
