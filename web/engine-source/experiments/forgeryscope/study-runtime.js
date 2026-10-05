export async function environment(provider) {
  const ort=await import('/ort/'+(provider==='wasm'?'ort.wasm.min.mjs':'ort.webgpu.min.mjs'));
  ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths='/ort/';
  const binary=async url=>{const r=await fetch(url);if(!r.ok)throw Error(url);return r.arrayBuffer();};
  const tensor=async(base,item,type='float32')=>new ort.Tensor(type,new (type==='int64'?BigInt64Array:Float32Array)(await binary(base+item.file)),item.shape);
  const session=async(base,item)=>{
    const bytes=new Uint8Array(await binary(base+item.file));
    const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(sha!==item.sha256)throw Error('Model identity: '+item.file);
    return ort.InferenceSession.create(bytes,{executionProviders:[provider],graphOptimizationLevel:'all'});
  };
  return {ort,binary,tensor,session};
}
export function compare(actual,expected){
  if(actual.length!==expected.length)return {shapeMismatch:true,actual:actual.length,expected:expected.length};
  let maxError=0,differences=0;
  for(let i=0;i<actual.length;i++){maxError=Math.max(maxError,Math.abs(Number(actual[i])-Number(expected[i])));differences+=actual[i]!==expected[i];}
  return {values:actual.length,maxError,differences};
}
