import "../../runtime-context.js?v=0.14.5";
import {requireValue,EngineError,checkAbort,controlCheckpoint} from './errors.js';

const HEAP_BYTES=64*1024**2;
// Both RGB inputs remain owned/admitted by the caller. Only halo rows enter WASM.
export function createElaCellDescriber({budget,wasmBinary}={}){
 requireValue(typeof budget?.reserve==='function','Shared budget required');
 let module,heapRelease,busy=false,disposed=false;
 async function ensure(){
  if(module)return module;
  const release=budget.reserve(HEAP_BYTES);
  try{const {default:create}=await import('../vendor/ela-describe/describe.js');module=await create(wasmBinary?{wasmBinary}:{});heapRelease=release;return module;}
  catch(error){release();throw error;}
 }
 return {
  async describe(image,compressed,block,{signal,onProgress}={}){
   if(busy)throw new EngineError('BUSY','ELA cell descriptor busy');
   requireValue(!disposed,'ELA cell descriptor disposed');
   const {width,height,data}=image,n=width*height,cols=Math.floor(width/block),rows=Math.floor(height/block),cells=rows*cols;
   requireValue(Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0&&Number.isSafeInteger(n)&&image.format==='rgb8'&&data instanceof Uint8Array&&data.length===n*3,'Original RGB8 pixels required');
   requireValue(compressed.width===width&&compressed.height===height&&compressed.format==='rgb8'&&compressed.data instanceof Uint8Array&&compressed.data.length===n*3,'Matching recompressed RGB8 pixels required');
   requireValue(Number.isInteger(block)&&block>=16&&block%8===0&&cells>0&&cells<=16384,'Native ELA cell grid required');
   const stripePixels=width*Math.min(height,block+16);
   // Conservative allowance for OpenCV planes, cell statistics and allocator.
   if(stripePixels*192+block*block*256+8*1024**2>HEAP_BYTES)throw new EngineError('MEMORY_LIMIT','ELA descriptor halo exceeds its current WASM limit; no resizing performed');
   checkAbort(signal);busy=true;let release,complete=false,m;const pointers=[];
   try{
    release=budget.reserve(cells*57);
    const content=new Float32Array(cells*6),profiles=new Float32Array(cells*5),background=new Float32Array(cells*3),usable=new Uint8Array(cells);
    m=await ensure();checkAbort(signal);
    for(const bytes of [stripePixels*3,stripePixels*3,cols*24,cols*20,cols,cols*12]){const pointer=m._malloc(bytes);if(!pointer)throw new EngineError('MEMORY_LIMIT','ELA descriptor allocation failed');pointers.push(pointer);}
    const [pa,pb,pc,pp,pu,pg]=pointers;
    for(let row=0;row<rows;row++){
     await controlCheckpoint(signal);
     const y=row*block,lo=Math.max(0,y-8),hi=Math.min(height,y+block+8),start=lo*width*3,end=hi*width*3;
     m.HEAPU8.set(data.subarray(start,end),pa);m.HEAPU8.set(compressed.data.subarray(start,end),pb);
     if(!m._ela_describe_unlogged(pa,pb,width,hi-lo,y-lo,block,height,lo,pc,pp,pu,pg))throw new EngineError('COMPUTE_FAILED','ELA cell descriptor failed');
     content.set(m.HEAPF32.subarray(pc/4,pc/4+cols*6),row*cols*6);
     for(let col=0;col<cols;col++)for(let d=1;d<6;d++){if(d===4)continue;const at=(row*cols+col)*6+d;content[at]=Math.log1p(content[at]);}
     profiles.set(m.HEAPF32.subarray(pp/4,pp/4+cols*5),row*cols*5);
     background.set(m.HEAPF32.subarray(pg/4,pg/4+cols*3),row*cols*3);
     usable.set(m.HEAPU8.subarray(pu,pu+cols),row*cols);onProgress?.((row+1)/rows);
    }
    checkAbort(signal);complete=true;return {rows,cols,block,content,profiles,background,usable,release};
   }finally{if(m)for(const p of pointers)m._free(p);if(!complete)release?.();busy=false;}
  },
  dispose(){if(busy)throw new EngineError('BUSY','ELA cell descriptor busy');module=null;heapRelease?.();heapRelease=null;disposed=true;}
 };
}
