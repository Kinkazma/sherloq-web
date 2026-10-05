export async function tntGpuBrowserTest(){
  const {Budget}=await import('/src/cache.js'),{createTntLinearGpu}=await import('/experiments/segmentation/tnt-linear-gpu.js');
  const base='/fixtures/tnt-math/',reference=await(await fetch(base+'reference.json')).json();
  const budget=new Budget(1024**3),pool=await createTntLinearGpu({budget}),records=[],checks={};
  const assert=(v,m)=>{if(!v)throw Error(m);};
  const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),v=>v.toString(16).padStart(2,'0')).join('');
  const seed=(n,s)=>{const a=new Float32Array(n);for(let i=0;i<n;i++){s=(Math.imul(1664525,s)+1013904223)>>>0;a[i]=((s>>>8)-8388608)/8388608;}return a;};
  const transpose=(x,r,c)=>{const y=new Float32Array(x.length);for(let i=0;i<r;i++)for(let j=0;j<c;j++)y[j*r+i]=x[i*c+j];return y;};
  const make=r=>({input:transpose(seed(r.rows*r.ci,r.seed),r.rows,r.ci),weight:seed(r.ci*r.co,r.seed+1),bias:r.bias?seed(r.co,r.seed+2):new Float32Array(r.co),rows:r.rows,ci:r.ci,co:r.co,hasBias:r.bias});
  const rejected=async(work,code)=>{try{await work();}catch(e){assert(e.code===code,'Expected '+code+', got '+e.code);return true;}throw Error('Expected '+code);};
  try{
    for(const row of reference.records.filter(r=>r.kind==='linear')){
      let result;const began=performance.now();
      try{
        result=await pool.run(make(row));const milliseconds=performance.now()-began;
        const expected=await(await fetch(base+row.output.file)).arrayBuffer();assert(expected.byteLength===row.output.bytes&&await hash(expected)===row.output.sha256,'Native fixture identity');
        const sha256=await hash(transpose(result.data,row.co,row.rows));assert(sha256===row.output.sha256,'Native linear output differs');
        records.push({rows:row.rows,ci:row.ci,co:row.co,hasBias:row.bias,milliseconds,sha256,nativeExact:true,gpu:result.gpu,timings:result.timings});
      }finally{result?.release();}
    }
    const row=reference.records.find(r=>r.kind==='linear'),input=make(row),resident=budget.total(),abort=new AbortController();let submitted=false;
    checks.cancelAfterSubmit=await rejected(()=>pool.run(input,{signal:abort.signal,onProgress:()=>{submitted=true;abort.abort();}}),'CANCELLED');assert(submitted,'Actual GPU submission');assert(budget.total()===resident,'Cancellation leak');
    checks.preAbort=await rejected(()=>pool.run(input,{signal:abort.signal}),'CANCELLED');
    checks.geometry=await rejected(()=>pool.run({...input,rows:255}),'INVALID_INPUT');
    budget.limit=resident+1;checks.memory=await rejected(()=>pool.run(input),'MEMORY_LIMIT');assert(budget.total()===resident,'Admission leak');budget.limit=1024**3;
    const retry=await pool.run(input);try{checks.retry=await hash(transpose(retry.data,row.co,row.rows))===row.output.sha256;}finally{retry.release();}
  }finally{pool.dispose();}
  assert(budget.total()===0,'GPU ownership leak');
  return{schema:1,status:'passed',scope:'Five independent seeded native linear fixtures including channel32 bias order and a biasless reduction; actual GPU submission cancellation, pre-abort, memory/geometry refusal, exact retry and release. No expected activation enters computation.',records,checks,memory:budget.snapshot()};
}
