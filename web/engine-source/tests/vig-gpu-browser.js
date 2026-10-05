export async function vigGpuBrowserTest(){
 const {Budget}=await import('/src/cache.js'),{createVigConvolutionGpu}=await import('/experiments/segmentation/vig-convolution-gpu.js');
 const base='/fixtures/vig-math/',reference=await(await fetch(base+'reference.json')).json();
 const budget=new Budget(1024**3),pool=await createVigConvolutionGpu({budget}),records=[],checks={};
 const assert=(v,m)=>{if(!v)throw Error(m);},hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),v=>v.toString(16).padStart(2,'0')).join('');
 const seed=(n,s)=>{const a=new Float32Array(n);for(let i=0;i<n;i++){s=(Math.imul(1664525,s)+1013904223)>>>0;a[i]=((s>>>8)-8388608)/8388608;}return a;};
 const make=r=>{const g=r.geometry;return{input:seed(g[0]*g[1]*g[2],r.seed),weight:seed(g[3]*g[0]/g[7]*g[4]*g[4],r.seed+1),bias:seed(g[3],r.seed+2),geometry:g};};
 const rejected=async(work,code)=>{try{await work();}catch(e){assert(e.code===code,'Expected '+code+', got '+e.code);return true;}throw Error('Expected '+code);};
 try{
  for(const r of reference.records.filter(r=>r.kind==='conv')){
   let result;const start=performance.now();
   try{result=await pool.run(make(r));const milliseconds=performance.now()-start,bytes=await(await fetch(base+r.output.file)).arrayBuffer();assert(bytes.byteLength===r.output.bytes&&await hash(bytes)===r.output.sha256,'Native fixture identity');
    const actual=await hash(result.data);records.push({name:r.name,geometry:r.geometry,milliseconds,sha256:actual,nativeExact:actual===r.output.sha256,gpu:result.gpu,timings:result.timings});
   }finally{result?.release();}
  }
  const stem=reference.records.find(r=>r.kind==='conv'&&r.geometry[0]===3),input=make(stem),resident=budget.total(),abort=new AbortController();let submitted=false;
  checks.cancelAfterSubmit=await rejected(()=>pool.run(input,{signal:abort.signal,onProgress:()=>{submitted=true;abort.abort();}}),'CANCELLED');assert(submitted,'Actual GPU submission required');assert(budget.total()===resident,'Cancellation leaked buffers or output');
  checks.alreadyCancelled=await rejected(()=>pool.run(input,{signal:abort.signal}),'CANCELLED');
  checks.geometry=await rejected(()=>pool.run({...input,geometry:[3,255,256,80,3,1,2,1]}),'INVALID_INPUT');
  budget.limit=resident+1;checks.memory=await rejected(()=>pool.run(input),'MEMORY_LIMIT');assert(budget.total()===resident,'Admission leak');budget.limit=1024**3;
  const retry=await pool.run(input);try{checks.retry=await hash(retry.data)===stem.output.sha256;}finally{retry.release();}
 }finally{pool.dispose();}
 assert(budget.total()===0,'GPU pool ownership leak');
 return{schema:1,status:records.every(r=>r.nativeExact)&&Object.values(checks).every(Boolean)?'passed':'rejected',scope:'Three independent seeded native convolution fixtures (stem bias domains, grouped graph convolution and FFN); actual ordered GPU execution, cancellation after submission, refusal, retry and release. No model oracle is used as a computation input.',records,checks,memory:budget.snapshot()};
}
