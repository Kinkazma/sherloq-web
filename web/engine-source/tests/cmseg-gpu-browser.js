export async function cmsegGpuBrowserTest(){
  const {Budget}=await import('/src/cache.js');
  const {createCmsegBackbone}=await import('/experiments/segmentation/cmseg-backbone.js');
  const {readVerifiedModelAsset}=await import('/experiments/d2prl/model.js');
  const {SEGMENTATION_MODELS}=await import('/experiments/segmentation/models.js');
  const base=new URL('/.build/cmseg-backbone-candidate/',location.href),model=SEGMENTATION_MODELS['cmseg-generalization'];
  const graph=JSON.parse(new TextDecoder().decode(await readVerifiedModelAsset(new URL(model.backbone.file,base).href,model.backbone)));
  const budget=new Budget(1024**3),checks={},input=new Float32Array(3*512**2);
  const assert=(v,m)=>{if(!v)throw Error(m);};
  const rejected=async(work,code)=>{try{await work();}catch(e){assert(e.code===code,'Expected '+code+', got '+e.code);return true;}throw Error('Expected '+code);};
  const make=()=>createCmsegBackbone({budget,graph,backend:'webgpu',read:(spec,hooks)=>readVerifiedModelAsset(new URL(spec.file,base).href,spec,hooks)});
  // Cancel after real submission twice; the second attempt reuses the pipeline.
  const backbone=await make();let submitted=0;
  try{
    for(let attempt=0;attempt<2;attempt++){
      const abort=new AbortController();
      checks['cancelAfterSubmit'+attempt]=await rejected(()=>backbone.run(input,{signal:abort.signal,onProgress:p=>{if(p.phase==='cmseg-backbone-gpu'){submitted++;abort.abort();}}}),'CANCELLED');
      if(attempt===0)checks.residentAfterFirst=budget.total();else assert(budget.total()===checks.residentAfterFirst,'Cancellation retained tensors or buffers');
    }
    assert(submitted===2,'Actual GPU submissions required');
    const abort=new AbortController();abort.abort();
    checks.preAbort=await rejected(()=>backbone.run(input,{signal:abort.signal}),'CANCELLED');
    const resident=budget.total();budget.limit=resident+1;
    checks.memory=await rejected(()=>backbone.run(input),'MEMORY_LIMIT');
    assert(budget.total()===resident,'Failed admission leaked a reservation');budget.limit=1024**3;
  }finally{backbone.dispose();}
  assert(budget.total()===0,'Backbone ownership leak');checks.disposed=true;
  // Reject insufficient Winograd/math residency, cleaning the GPU device too.
  budget.limit=32*1024**2;checks.constructorRollback=await rejected(make,'MEMORY_LIMIT');
  assert(budget.total()===0,'Constructor ownership leak');
  return{schema:1,status:'passed',scope:'Actual CMSeg backbone cancellation after ordered GPU submission, pipeline reuse, pre-abort, memory refusal and constructor rollback; every owned reservation released. Full numeric inference and API retry have separate recipes.',checks,memory:budget.snapshot()};
}
