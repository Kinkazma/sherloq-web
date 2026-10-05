import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
// Scientific stores already use oriented, full-resolution image coordinates.
// Window data is owned by the caller; no writable view of cached stores escapes.
export function createNumericSurface(store,{width,height,format,budget,semantics,dispose=()=>store.dispose()}={}){
 requireValue([width,height].every(n=>Number.isSafeInteger(n)&&n>0)&&Number.isSafeInteger(width*height*4)&&store.byteLength===width*height*4&&['float32','int32'].includes(format)&&budget&&typeof semantics==='string','Scientific plane geometry, type and semantics required.');
 const Type=format==='float32'?Float32Array:Int32Array,id=crypto.randomUUID();let closed=false,disposing;
 const alive=()=>{if(closed)throw new EngineError('DISPOSED','Scientific surface disposed.');};
 return {descriptor:Object.freeze({id,revision:1,width,height,format,semantics,coordinates:'full-resolution',storage:store.storage??'segmented'}),
  async readWindow({x=0,y=0,width:w=width,height:h=height}={}, {signal}={}){
   alive();checkAbort(signal);requireValue([x,y,w,h].every(Number.isSafeInteger)&&x>=0&&y>=0&&w>0&&h>0&&x<=width-w&&y<=height-h,'Scientific window is outside the full-resolution surface.');const release=budget.reserve(w*h*4);
   try{const data=new Type(w*h),bytes=new Uint8Array(data.buffer);if(x===0&&w===width){for(let at=0;at<bytes.length;at+=1024**2){await controlCheckpoint(signal);alive();await store.readInto(bytes.subarray(at,Math.min(bytes.length,at+1024**2)),y*width*4+at);}}
    else for(let row=0;row<h;row++){if(row%32===0){await controlCheckpoint(signal);alive();}await store.readInto(bytes.subarray(row*w*4,(row+1)*w*4),((y+row)*width+x)*4);}
    alive();checkAbort(signal);return {surfaceId:id,revision:1,origin:[x,y],pixels:{width:w,height:h,format,data},release};
   }catch(error){release();if(error instanceof RangeError)throw new EngineError('MEMORY_ALLOCATION','Scientific window allocation failed.');throw error;}
  },
  dispose(){if(disposing)return disposing;closed=true;disposing=Promise.resolve().then(dispose);return disposing;}
 };
}
