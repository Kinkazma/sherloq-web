// Compile only the selected useful module. Unsupported language features may
// select the scalar implementation; fetch, allocation and source errors retain
// their identity. The numerical gate is arithmetic admission, not calibration.
const modules=new Map();let scalarOnly=false;
async function compiled(variant,options){
 if(options.wasmBinary)return WebAssembly.compile(options.wasmBinary);
 const name=variant==='simd'?'__NAME__-simd.wasm':'__NAME__.wasm',prefix=new URL('./',import.meta.url).href,url=new URL(options.locateFile?options.locateFile(name,prefix):name,prefix);let pending=modules.get(url.href);
 if(!pending){pending=(async()=>{if(url.protocol==='file:'&&typeof process==='object'&&process.versions?.node){const{readFile}=await import('node:fs/promises');return WebAssembly.compile(await readFile(url));}const response=await fetch(url,{credentials:'same-origin'});if(!response.ok)throw Error('ZERO runtime download: '+response.status);return WebAssembly.compileStreaming&&response.headers.get('Content-Type')?.split(';')[0]==='application/wasm'?WebAssembly.compileStreaming(response):WebAssembly.compile(await response.arrayBuffer());})();modules.set(url.href,pending);void pending.catch(()=>modules.delete(url.href));}return pending;
}
export default async function createZero(options={}){
 const requested=options.wasmVariant??'auto';if(!['auto','scalar','simd'].includes(requested))throw Error('Invalid ZERO WASM variant.');let variant=requested==='auto'?(options.wasmBinary||scalarOnly?'scalar':'simd'):requested,module,fallback;
 if(!options.instantiateWasm)try{module=await compiled(variant,options);}catch(error){if(requested!=='auto'||variant!=='simd'||!(error instanceof WebAssembly.CompileError))throw error;fallback=String(error.message);variant='scalar';scalarOnly=true;module=await compiled(variant,{...options,wasmBinary:undefined});}
 const{default:factory}=await import(variant==='simd'?'./__NAME__-simd.js':'./__NAME__-scalar.js'),configuration={...options};delete configuration.wasmVariant;if(module)configuration.instantiateWasm=(imports,receive)=>{const instance=new WebAssembly.Instance(module,imports);receive(instance,module);return instance.exports;};
 const runtime=await factory(configuration);runtime.zeroVariant=options.wasmBinary||options.instantiateWasm?'provided':variant;if(fallback)runtime.zeroVariantFallback=fallback;runtime.zeroFmaDifferences=runtime._zero_fma64_qualify();
 const setter=runtime._zero_set_reference;if(setter)runtime._zero_set_reference=value=>{setter(value);runtime._zero_fma64_set_enabled(!value);};
 if(runtime._zero_reference_votes_bytes){const call=runtime._zero_reference_votes_bytes;runtime._zero_reference_votes_bytes=(...args)=>{const before=runtime._zero_fma64_enabled();runtime._zero_fma64_set_enabled(0);try{return call(...args);}finally{runtime._zero_fma64_set_enabled(before);}};}
 return runtime;
}
