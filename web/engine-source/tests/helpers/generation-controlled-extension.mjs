// Explicit test-only logits; no model/runtime bytes are fetched or executed.
export const generationControlledState={calls:[],gate:null};
export async function createExtensionEngine(options){
 const actual=await import(new URL('engine.js',options.baseURL));
 return actual.createExtensionEngine({...options,createPool:budget=>({slots:[],snapshot:()=>({residentWorkers:0}),clear(){},dispose(){},async run(model,feeds,{signal,onProgress}){
  if(signal?.aborted)throw signal.reason;const bytes=new Uint8Array(feeds.images.data.buffer,feeds.images.data.byteOffset,feeds.images.data.byteLength),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  generationControlledState.calls.push({model,hash,dims:[...feeds.images.dims]});onProgress?.({phase:'inference',model});await generationControlledState.gate?.({signal});if(signal?.aborted)throw signal.reason;
  const logit=Math.fround((Number.parseInt(hash.slice(0,8),16)%20001-10000)/1000),release=budget.reserve(4);return{result:{logits:{data:Float32Array.of(logit),dims:[1,1]}},metrics:{provider:'controlled-no-model',threads:1},release};
 }})});
}
