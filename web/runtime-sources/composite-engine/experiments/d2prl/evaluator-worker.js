// One scalar WASM engine per worker. No nested thread pool or warm-up work.
let module, limit, tileSize, xp, yp, out;
const features=new Map();
function allocate(bytes){const p=module._malloc(bytes);if(!p||module.HEAPU8.length>limit)throw Error('Worker heap admission');return p;}
self.onmessage=async({data})=>{
 const {id,type}=data;
 try{
  if(type==='init'){
   const {default:factory}=await import(data.moduleUrl);module=await factory();limit=data.heapLimit;tileSize=data.tileSize;
   xp=allocate(13*tileSize*4);yp=allocate(13*tileSize*4);out=allocate(2*tileSize*4);
   self.postMessage({id,ok:true});
  }else if(type==='features'){
   if(features.has(data.key))throw Error('Duplicate descriptor');
   if(features.size>=3){const key=features.keys().next().value;module._free(features.get(key));features.delete(key);}
   const pointer=allocate(data.values.byteLength);module.HEAPU8.set(new Uint8Array(data.values.buffer,data.values.byteOffset,data.values.byteLength),pointer);features.set(data.key,pointer);data.values=null;
   self.postMessage({id,ok:true});
  }else if(type==='evaluate'){
   const pointer=features.get(data.key),count=data.end-data.begin;
   if(pointer===undefined||count<1||count>tileSize)throw Error('Worker tile');
   module.HEAPF32.set(data.x,xp/4);module.HEAPF32.set(data.y,yp/4);
   if(module._d2prl_evaluate_tile(pointer,xp,yp,data.side,data.channels,data.candidates,data.begin,data.end,out,out+count*4,data.referenceThreads)!==1)throw Error('Worker evaluator rejected');
   const x=module.HEAPF32.slice(out/4,out/4+count),y=module.HEAPF32.slice(out/4+count,out/4+2*count);
   self.postMessage({id,ok:true,x,y},[x.buffer,y.buffer]);
  }else throw Error('Unknown evaluator message');
 }catch(error){self.postMessage({id,ok:false,error:String(error?.message??error)});}
};
