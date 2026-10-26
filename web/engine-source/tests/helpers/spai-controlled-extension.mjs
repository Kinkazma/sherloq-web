// Test-only graph outputs; actual SPAI224 preprocessing and native aggregation run.
export const spaiControlledState={calls:[],gate:null};
export async function createExtensionEngine(options){
 const actual=await import(new URL('engine.js',options.baseURL));
 return actual.createExtensionEngine({...options,createPool:budget=>({slots:[],snapshot:()=>({residentWorkers:0}),clear(){},dispose(){},async run(model,feeds,{signal,onProgress}){
  if(signal?.aborted)throw signal.reason;const entries=await Promise.all(Object.entries(feeds).map(async([name,feed])=>[name,[...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(feed.data.buffer,feed.data.byteOffset,feed.data.byteLength)))].map(x=>x.toString(16).padStart(2,'0')).join('')])),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(entries))))].map(x=>x.toString(16).padStart(2,'0')).join('');
  spaiControlledState.calls.push({model,hash,dims:Object.fromEntries(Object.entries(feeds).map(([n,f])=>[n,[...f.dims]]))});onProgress?.({phase:'inference',model});await spaiControlledState.gate?.({signal});if(signal?.aborted)throw signal.reason;
  const encoder=model==='models/spai/encoder.onnx',batch=encoder?feeds.x.dims[0]:1,data=encoder?Float32Array.from({length:batch*1096},(_,i)=>Math.fround((Number.parseInt(hash.slice(0,6),16)%10000)/10000+(i%13)/16)):Float32Array.of(Math.fround((Number.parseInt(hash.slice(0,8),16)%20001-10000)/1000)),release=budget.reserve(data.byteLength);
  return{result:{[encoder?'features':'logits']:{data,dims:encoder?[batch,1096]:[1,1]}},metrics:{provider:'controlled-no-model',threads:1},release};
 }})});
}
