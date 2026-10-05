export async function vigDistanceGpuBrowserTest(){
  const {Budget}=await import('/src/cache.js'),{createVigConvolutionGpu}=await import('/experiments/segmentation/vig-convolution-gpu.js'),{default:factory}=await import('/vendor/segmentation/vig-math.js'),{controlCheckpoint}=await import('/src/errors.js');
  const budget=new Budget(1024**3),heapRelease=budget.reserve(64*1024**2),math=await factory(),pool=await createVigConvolutionGpu({budget}),records=[],checks={};
  const assert=(v,m)=>{if(!v)throw Error(m);},hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),v=>v.toString(16).padStart(2,'0')).join('');
  const base='/fixtures/vig-math/',reference=await(await fetch(base+'reference.json')).json();
  const seed=(n,s)=>{const a=new Float32Array(n);for(let i=0;i<n;i++){s=(Math.imul(1664525,s)+1013904223)>>>0;a[i]=((s>>>8)-8388608)/8388608;}return a;};
  const native=async spec=>{const b=await(await fetch(base+spec.file)).arrayBuffer();assert(b.byteLength===spec.bytes&&await hash(b)===spec.sha256,'Native fixture identity');return spec.sha256;};
  let retryInput,retrySha;
  try{
    for(const row of reference.records.filter(v=>v.kind==='graph')){
      const pointers=[],put=n=>{const p=math._malloc(n);assert(p>0,'Graph heap admission');pointers.push(p);return p;};
      try{
        const values=seed(640*256,row.seed);if(row.name==='ties')for(let c=0;c<640;c++)for(let i=0;i<256;i+=4)values.fill(values[c*256+i],c*256+i,c*256+i+4);
        const x=put(values.byteLength),normal=put(values.byteLength),sums=put(256*4),distance=put(256**2*4),indices=put(256*row.k*row.dilation*4),out=put(1280*256*4);
        math.HEAPF32.set(values,x/4);math._vig_normalize(x,normal,sums);
        const input={normal:math.HEAPF32.subarray(normal/4,normal/4+640*256),sums:math.HEAPF32.subarray(sums/4,sums/4+256)},samples=[];
        const cpu=async()=>{let stamp=performance.now();for(let first=0;first<256;first+=8){math._vig_distance_rows(normal,sums,first,8,distance);if(performance.now()-stamp>=8){await controlCheckpoint();stamp=performance.now();}}return{data:math.HEAPF32.slice(distance/4,distance/4+256**2)};};
        for(let run=0;run<3;run++){
          const sample={run,order:run===1?'gpu-cpu':'cpu-gpu'};
          for(const backend of run===1?['gpu','cpu']:['cpu','gpu']){
            let result;
            try{
              const start=performance.now();result=backend==='gpu'?await pool.distance(input):await cpu();sample[backend+'Ms']=performance.now()-start;
              const sha256=await hash(result.data);assert(sha256===await native(row.distance),'Native distance differs: '+row.name+' '+backend);
              math.HEAPF32.set(result.data,distance/4);
              for(let first=0;first<256;first+=7){const count=Math.min(7,256-first);math._vig_topk_rows(distance,first,count,row.k*row.dilation,indices);math._vig_gather_rows(x,row.k,row.dilation,indices,first,count,out);}
              assert(await hash(math.HEAP32.subarray(indices/4,indices/4+256*row.k*row.dilation))===await native(row.indices),'Native neighbor indices differ');
              assert(await hash(math.HEAPF32.subarray(out/4,out/4+1280*256))===await native(row.gather),'Native graph packing differs');
              if(backend==='gpu'&&run===0)Object.assign(sample,{gpu:result.gpu,timings:result.timings});
            }finally{result?.release?.();}
          }
          samples.push(sample);
        }
        assert(await hash(input.normal)===await native(row.normal),'Native normalization differs');
        records.push({name:row.name,k:row.k,dilation:row.dilation,samples,distanceSha256:row.distance.sha256,indicesSha256:row.indices.sha256,gatherSha256:row.gather.sha256,nativeExact:true});
        retryInput={normal:input.normal.slice(),sums:input.sums.slice()};retrySha=row.distance.sha256;
      }finally{pointers.forEach(p=>math._free(p));}
    }
    const rejected=async(work,code)=>{try{await work();}catch(e){assert(e.code===code,'Expected '+code+', got '+e.code);return true;}throw Error('Expected '+code);};
    const resident=budget.total(),abort=new AbortController();let submitted=false;
    checks.cancelAfterSubmit=await rejected(()=>pool.distance(retryInput,{signal:abort.signal,onProgress:()=>{submitted=true;abort.abort();}}),'CANCELLED');assert(submitted&&budget.total()===resident,'Actual distance submit/cancel ownership');
    checks.preAbort=await rejected(()=>pool.distance(retryInput,{signal:abort.signal}),'CANCELLED');checks.geometry=await rejected(()=>pool.distance({...retryInput,sums:new Float32Array(255)}),'INVALID_INPUT');
    budget.limit=resident+1;checks.memory=await rejected(()=>pool.distance(retryInput),'MEMORY_LIMIT');assert(budget.total()===resident,'Distance admission leak');budget.limit=1024**3;
    const retry=await pool.distance(retryInput);try{checks.retry=await hash(retry.data)===retrySha;}finally{retry.release();}
  }finally{pool.dispose();heapRelease();}
  assert(budget.total()===0&&Object.values(checks).every(Boolean),'Distance lifecycle failure');
  return{schema:1,status:'passed',scope:'Seeded random and tied native VIG graph fixtures; unchanged WASM normalization, TopK, dilation and gather. GPU only computes complete ordered dot products; float32 postprocessing keeps native order. Each repeated CPU/GPU result is compared to independent native distances AND indices/gather, including tied neighbors. Timings include cooperative chunks, returned output copies, GPU layout/transfers/readback; exclude identical normalization and TopK/gather. Development observations on a shared host, no user calibration.',records,checks,memory:budget.snapshot()};
}
