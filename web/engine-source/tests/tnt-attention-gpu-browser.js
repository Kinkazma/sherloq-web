export async function tntAttentionGpuBrowserTest({measureCpu=true}={}){
 const {Budget}=await import('/src/cache.js'),{createTntLinearGpu}=await import('/experiments/segmentation/tnt-linear-gpu.js'),{default:factory}=await import('/vendor/segmentation/tnt-math.js'),{controlCheckpoint}=await import('/src/errors.js');
 const budget=new Budget(1024**3),heapRelease=budget.reserve(64*1024**2),math=await factory(),pool=await createTntLinearGpu({budget}),records=[],checks={};
 const assert=(v,m)=>{if(!v)throw Error(m);},hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),v=>v.toString(16).padStart(2,'0')).join('');
 const base='/fixtures/tnt-math/',reference=await(await fetch(base+'reference.json')).json();
 const seed=(n,s)=>{const a=new Float32Array(n);for(let i=0;i<n;i++){s=(Math.imul(1664525,s)+1013904223)>>>0;a[i]=((s>>>8)-8388608)/8388608;}return a;};
 const native=async spec=>{const b=await(await fetch(base+spec.file)).arrayBuffer();assert(b.byteLength===spec.bytes&&await hash(b)===spec.sha256,'Native fixture identity');return spec.sha256;};
 const wasm=async(arrays,length,run)=>{
  const pointers=[],put=n=>{const p=math._malloc(n);assert(p>0,'Attention heap admission');pointers.push(p);return p;};
  try{const inputs=arrays.map(a=>{const p=put(a.byteLength);math.HEAPF32.set(a,p/4);return p;}),out=put(length*4);await run(inputs,out);return math.HEAPF32.slice(out/4,out/4+length);}finally{pointers.forEach(p=>math._free(p));}
 };
 const cpu=({a,b,batch,rows,k,n,transposed})=>wasm([a,b],batch*rows*n,async([ap,bp],out)=>{
  const group=Math.max(1,Math.floor(1024**2/(rows*k*n)));let stamp=performance.now();
  for(let first=0;first<batch;first+=group){const count=Math.min(group,batch-first);math._tnt_matmul(ap+first*rows*k*4,bp+first*k*n*4,count,rows,k,n,Number(transposed),0,out+first*rows*n*4);if(performance.now()-stamp>=8){await controlCheckpoint();stamp=performance.now();}}
 });
 // Repeated observations include staging, layout and readback. Alternate the
 // order after the initial CPU/GPU pair; no calibration enters the product.
 const warm=async(input,expected)=>{
  const samples=[];
  if(!measureCpu)return samples;
  for(let run=0;run<2;run++){
   const sample={run:run+1,order:run===0?'gpu-cpu':'cpu-gpu'};
   for(const backend of run===0?['gpu','cpu']:['cpu','gpu']){
    let result;
    try{const start=performance.now();result=backend==='gpu'?await pool.matmul(input):{data:await cpu(input)};sample[backend+'Ms']=performance.now()-start;assert(await hash(result.data)===expected,'Warm attention differs');}
    finally{result?.release?.();}
   }
   samples.push(sample);
  }
  return samples;
 };
 let retryInput,retrySha;
 try{
  for(const row of reference.records.filter(v=>v.kind==='attention')){
   const {batch,heads,n,d}=row,bh=batch*heads,packed=seed(batch*n*2*heads*d,911),vl=seed(batch*n*heads*d,913),q=new Float32Array(bh*n*d),k=q.slice(),v=q.slice();
   for(let b=0;b<batch;b++)for(let h=0;h<heads;h++)for(let t=0;t<n;t++)for(let c=0;c<d;c++){
    const dst=((b*heads+h)*n+t)*d+c,src=(b*n+t)*heads*d+h*d+c;q[dst]=packed[(b*n+t)*2*heads*d+h*d+c];k[dst]=packed[(b*n+t)*2*heads*d+heads*d+h*d+c];v[dst]=vl[src];
   }
   const scoreInput={a:q,b:k,batch:bh,rows:n,k:d,n,transposed:true};let output;
   try{
    let began=performance.now();const cpuScores=measureCpu?await cpu(scoreInput):null,cpuMs=measureCpu?performance.now()-began:null;
    began=performance.now();output=await pool.matmul(scoreInput);const gpuMs=performance.now()-began,sha256=await hash(output.data),expected=await native(row.scores);
    assert(sha256===expected&&(!measureCpu||await hash(cpuScores)===expected),'Native score matrix differs');records.push({kind:'scores',batch:bh,rows:n,k:d,n,cpuMs,gpuMs,warm:await warm(scoreInput,expected),sha256,nativeExact:true,gpu:output.gpu,timings:output.timings});
    const scaled=output.data.slice(),scale=Math.fround(d**-.5);for(let i=0;i<scaled.length;i++)scaled[i]*=scale;
    assert(await hash(scaled)===await native(row.scaled),'Scaled score differs');
    const probability=await wasm([scaled],scaled.length,([input],out)=>math._tnt_softmax(input,bh*n,n,out));assert(await hash(probability)===await native(row.probability),'Unchanged softmax differs');
    output.release();output=undefined;const contextInput={a:probability,b:v,batch:bh,rows:n,k:n,n:d,transposed:false};
    began=performance.now();const cpuContext=measureCpu?await cpu(contextInput):null,cpuContextMs=measureCpu?performance.now()-began:null;
    began=performance.now();output=await pool.matmul(contextInput);const gpuContextMs=performance.now()-began,contextSha=await hash(output.data),expectedContext=await native(row.context);
    assert(contextSha===expectedContext&&(!measureCpu||await hash(cpuContext)===expectedContext),'Native context matrix differs');records.push({kind:'context',batch:bh,rows:n,k:n,n:d,cpuMs:cpuContextMs,gpuMs:gpuContextMs,warm:await warm(contextInput,expectedContext),sha256:contextSha,nativeExact:true,gpu:output.gpu,timings:output.timings});
    retryInput=scoreInput;retrySha=expected;
   }finally{output?.release();}
  }
  const rejected=async(work,code)=>{try{await work();}catch(e){assert(e.code===code,'Expected '+code+', got '+e.code);return true;}throw Error('Expected '+code);};
  const resident=budget.total(),abort=new AbortController();let submitted=false;
  checks.cancelAfterSubmit=await rejected(()=>pool.matmul(retryInput,{signal:abort.signal,onProgress:()=>{submitted=true;abort.abort();}}),'CANCELLED');assert(submitted&&budget.total()===resident,'Actual attention submit/cancel ownership');
  checks.preAbort=await rejected(()=>pool.matmul(retryInput,{signal:abort.signal}),'CANCELLED');checks.geometry=await rejected(()=>pool.matmul({...retryInput,batch:9}),'INVALID_INPUT');
  budget.limit=resident+1;checks.memory=await rejected(()=>pool.matmul(retryInput),'MEMORY_LIMIT');assert(budget.total()===resident,'Attention admission leak');budget.limit=1024**3;
  const retry=await pool.matmul(retryInput);try{checks.retry=await hash(retry.data)===retrySha;}finally{retry.release();}
 }finally{pool.dispose();heapRelease();}
 assert(budget.total()===0&&Object.values(checks).every(Boolean),'Attention lifecycle failure');
 return{schema:1,status:'passed',measureCpu,timingQualification:measureCpu?'paired-operation-observation':'correctness-only; concurrent native reference; timings not used as performance evidence',scope:'Four real TNT attention matrix geometries from public seeded native fixtures. Expected arrays fetched only for comparison after computation; GPU scores feed unchanged native WASM scaling/softmax and then GPU context. Complete zero-initialized FMA reductions with partitioned independent heads. CPU timings include WASM staging and cooperative chunks; GPU timings include layout, transfers and readback. Actual submitted-GPU cancellation, invalid geometry, pre-abort, memory refusal, exact retry and final ownership.',records,checks,memory:budget.snapshot()};
}
