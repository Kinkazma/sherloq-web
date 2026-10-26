// Complete output elements: every dot product retains its native K order.
let module, geometry, tile, pointers=[], input, weight, bias, output, shape;
const clear=()=>{for(const p of pointers)module._free(p);pointers=[];geometry=null;};
const allocate=bytes=>{const p=module._malloc(bytes);if(!p)throw Error('VIG convolution heap admission');pointers.push(p);return p;};
self.onmessage=async({data})=>{
 const{id,kind}=data;
 try{
  if(kind==='init'){module=await(await import(data.moduleUrl)).default();if(module.HEAPU8.length!==64*1024**2)throw Error('VIG heap identity');}
  else if(kind==='load'){
   clear();geometry=data.geometry;tile=data.tile;input=allocate(data.input.byteLength);weight=allocate(data.weight.byteLength);bias=allocate(data.bias.byteLength);output=allocate(tile*4);shape=allocate(32);
   module.HEAPF32.set(data.input,input/4);module.HEAPF32.set(data.weight,weight/4);module.HEAPF32.set(data.bias,bias/4);module.HEAP32.set(geometry,shape/4);
  }else if(kind==='compute'){
   if(!geometry||!Number.isInteger(data.first)||!Number.isInteger(data.count)||data.first<0||data.count<1||data.count>tile)throw Error('VIG result range');
   if(module._vig_conv(input,weight,bias,shape,data.first,data.count,output)!==1)throw Error('VIG convolution range');
   const values=module.HEAPF32.slice(output/4,output/4+data.count);self.postMessage({id,ok:true,values,heapBytes:module.HEAPU8.length},[values.buffer]);return;
  }else if(kind==='clear')clear();else throw Error('VIG convolution operation');
  self.postMessage({id,ok:true,heapBytes:module.HEAPU8.length});
 }catch(error){if(module)clear();self.postMessage({id,ok:false,error:String(error?.message??error)});}
};
