// One bounded ORT heap shared by the two qualified CNN graphs. Correlation is
// dispatched by the parent through its globally admitted pool, never nested here.
let ort,runtime,manifest;const sessions={};
async function read(url,spec){
  const response=await fetch(url);if(!response.ok||!response.body)throw Error('CMSeg asset unavailable');
  const bytes=new Uint8Array(spec.bytes),reader=response.body.getReader();let at=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;if(at+value.byteLength>bytes.length)throw Error('CMSeg asset exceeds pinned size');bytes.set(value,at);at+=value.byteLength;}}
  finally{await reader.cancel();reader.releaseLock();}
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(at!==spec.bytes||sha!==spec.sha256)throw Error('CMSeg asset identity mismatch');return bytes;
}
self.onmessage=async({data})=>{
  const inputs={};let outputs;
  try{
    const started=performance.now();let modelLoadMs=0;
    if(!manifest){
      self.postMessage({phase:'model-load'});
      manifest=JSON.parse(new TextDecoder().decode(await read(data.modelUrl,data.model)));
      if(manifest.id!==data.model.id||manifest.side!==512||manifest.graphs.length!==2||manifest.graphs.reduce((n,g)=>n+g.bytes,0)!==data.model.assetBytes||JSON.stringify(manifest.correlation)!==JSON.stringify(data.model.correlation))throw Error('Pinned CMSeg bundle structure');
      runtime=await import(data.runtimeFactoryUrl);ort=await import(data.ortUrl);
      ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths=data.wasmPaths;
      for(const spec of manifest.graphs){
        if(!(data.model.backbone?['bypass','decoder']:['encoder','decoder']).includes(spec.id)||!/^[a-z-]+\.onnx$/.test(spec.file)||sessions[spec.id])throw Error('CMSeg graph entry');
        const bytes=await read(new URL(spec.file,data.modelUrl).href,spec);
        sessions[spec.id]=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'disabled',enableCpuMemArena:false,enableMemPattern:false});
      }
      if(!(data.model.backbone?sessions.bypass:sessions.encoder)||!sessions.decoder||JSON.stringify(manifest.backbone)!==JSON.stringify(data.model.backbone))throw Error('Incomplete CMSeg bundle');modelLoadMs=performance.now()-started;
    }
    if(data.kind==='encoder'&&!data.model.backbone)inputs.rgb=new ort.Tensor('float32',data.input,[1,3,512,512]);
    else if(data.kind==='bypass'&&data.model.backbone)inputs[sessions.bypass.inputNames[0]]=new ort.Tensor('float32',data.input,[1,16,256,256]);
    else if(data.kind==='decoder')for(const [name,spec]of Object.entries(data.inputs))inputs[name]=new ort.Tensor('float32',spec.data,spec.shape);
    else throw Error('CMSeg stage');
    self.postMessage({phase:'inference',stage:data.kind});const before=performance.now();outputs=await sessions[data.kind].run(inputs);const inferenceMs=performance.now()-before,copyStarted=performance.now();
    const values={};for(const [name,tensor]of Object.entries(outputs)){
      if(data.kind==='decoder'&&name!=='probability')continue;
      const value=tensor.data.slice();if(!value.every(Number.isFinite))throw Error('Nonfinite CMSeg output');values[name]={data:value,shape:tensor.dims};
    }
    self.postMessage({ok:true,values,heapBytes:runtime.heapBytes(),ort:ort.env.versions,timings:{modelLoadMs,inferenceMs,outputCopyMs:performance.now()-copyStarted}},Object.values(values).map(v=>v.data.buffer));
  }catch(error){self.postMessage({ok:false,error:String(error?.message??error)});}
  finally{for(const input of Object.values(inputs))input.dispose();for(const value of Object.values(outputs??{}))value.dispose();}
};
