import {createEngine} from './index.js';
let engine;
self.onmessage=async ({data:{sequence,method,args,options}})=>{
 try {
  if(method==='init'){engine=createEngine(options);self.postMessage({sequence,result:engine.capabilities()});return;}
  if(!engine || !['capabilities','load','run','original','imagePixels','unload','dispose'].includes(method))throw new Error('Invalid worker method.');
  const result=await engine[method](...args,...(['load','run'].includes(method)?[{onProgress:progress=>self.postMessage({sequence,progress})}]:[]));
  const transfer=result?.pixels?[result.pixels.data.buffer]:result instanceof Uint8Array?[result.buffer]:result?.data instanceof Uint8Array?[result.data.buffer]:[];
  self.postMessage({sequence,result},transfer);
 }catch(error){self.postMessage({sequence,error:{code:error.code??'INTERNAL',message:error.code?error.message:'Engine task failed.'}});}
};
