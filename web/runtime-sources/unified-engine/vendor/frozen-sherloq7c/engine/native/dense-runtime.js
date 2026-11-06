// Copied to vendor/dense/dense.js by build-dense-math.py. The requested real
// module is compiled once per worker. No probe module or numerical warm-up runs.
const modules=new Map();let scalarOnly=false;
async function compiled(variant,options){
 if(options.wasmBinary)return WebAssembly.compile(options.wasmBinary);
 const name=variant==='simd'?'dense.wasm':'dense-scalar.wasm',prefix=new URL('./',import.meta.url).href;
 const url=new URL(options.locateFile?options.locateFile(name,prefix):name,prefix);
 let pending=modules.get(url.href);
 if(!pending){
  pending=(async()=>{
   if(url.protocol==='file:'&&typeof process==='object'&&process.versions?.node){
    const {readFile}=await import('node:fs/promises');return WebAssembly.compile(await readFile(url));
   }
   const response=await fetch(url,{credentials:'same-origin'});if(!response.ok)throw Error('Dense runtime download: '+response.status);
   if(WebAssembly.compileStreaming&&response.headers.get('Content-Type')?.split(';')[0]==='application/wasm')return WebAssembly.compileStreaming(response);
   return WebAssembly.compile(await response.arrayBuffer());
  })();modules.set(url.href,pending);pending.catch(()=>modules.delete(url.href));
 }
 return pending;
}
export default async function createDense(options={}){
 const requested=options.wasmVariant??'auto';if(!['auto','scalar','simd'].includes(requested))throw Error('Invalid dense WASM variant.');
 let variant=requested==='auto'?(scalarOnly?'scalar':'simd'):requested,module,fallback;
 if(!options.instantiateWasm){
  try{module=await compiled(variant,options);}
  catch(error){
   if(requested!=='auto'||variant!=='simd'||!(error instanceof WebAssembly.CompileError))throw error;
   // Older engines compile the scalar implementation of this same useful job.
   // Download failures and allocation errors remain visible, not misclassified.
   fallback=String(error.message);variant='scalar';if(!options.wasmBinary)scalarOnly=true;
   module=await compiled(variant,{...options,wasmBinary:undefined});
  }
 }
 const {default:factory}=await import(variant==='simd'?'./dense-simd.js':'./dense-scalar.js');
 const configuration={...options};delete configuration.wasmVariant;
 if(module)configuration.instantiateWasm=(imports,receive)=>{const instance=new WebAssembly.Instance(module,imports);receive(instance,module);return instance.exports;};
 const runtime=await factory(configuration);runtime.denseVariant=variant;if(fallback)runtime.denseVariantFallback=fallback;return runtime;
}
