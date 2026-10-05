import {createWorkerEngine} from '../src/worker-client.js';
import {initCvWasm} from '../src/opencv.js';
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');
const loadInput=async(f,field,id)=>{const bytes=new Uint8Array(await(await fetch('/fixtures/'+f[field])).arrayBuffer());return {id,bytes,pixels:{width:f.width,height:f.height,format:'rgb8',data:bytes}};};
export async function comparisonBrowserTest(){
 const reference=await(await fetch('/fixtures/comparison-reference.json')).json(),engine=createWorkerEngine(),report={schema:2,status:'passed',cases:0,views:0,maximumScoreErrors:{}};
 const arithmetic=await initCvWasm();for(const seed of [9744,0xabcdef01]){assert(arithmetic._cv_comparison_fma_test(seed,200000)===0,'Guarded FMA bit parity');assert(arithmetic._cv_comparison_simd_test(seed,200000)===0,'SIMD FMA bit parity');}report.arithmeticChecks={scalar:2048768,simd:1664768};
 try{
  for(const f of reference.cases){
   await engine.load(await loadInput(f,'first','i'));await engine.load(await loadInput(f,'second','r'));
   for(const v of f.views){
    const result=await engine.run({id:'compare',imageId:'i',operation:'comparison.image',params:{referenceImageId:'r',metrics:true,view:v.mode,equalized:v.equalized,grayscale:v.grayscale}}),d=result.data;
    assert(JSON.stringify(Object.keys(d.values).sort())===JSON.stringify(Object.keys(f.values).sort()),f.name+' values');assert(JSON.stringify(Object.keys(d.errors).sort())===JSON.stringify(Object.keys(f.errors).sort()),f.name+' undefined outcomes');
    for(const [name,value] of Object.entries(f.values)){
     const actual=d.values[name];if(typeof value==='string'||['ssimul','butter'].includes(name))assert(actual===value,f.name+' exact '+name);
     else{const error=Math.abs(actual-value);report.maximumScoreErrors[name]=Math.max(report.maximumScoreErrors[name]??0,error);assert(error<=1e-12*Math.max(1,Math.abs(value)),f.name+' '+name+' error '+error);}
    }
    assert(Math.abs(d.histogramCorrelationFullBins-f.histogramCorrelationFullBins)<=1e-12,'Full-bin correlation');assert(d.histogramCorrelationBinDivisor===65536&&d.warnings.hist_0,'Historical correlation flagged');
    assert(await hash(result.pixels.data)===v.sha256,f.name+' '+JSON.stringify(v));assert(result.provenance.references[0].imageId==='r','Reference provenance');result.pixels.data.fill(17);d.values.rmse=-1;report.views++;
   }
   await engine.unload('r');assert((await engine.capabilities()).memory.cacheBytes===0,'Reference unload clears pair cache');await engine.unload('i');report.cases++;console.log('Comparison qualified',f.name);
  }
  const f=reference.cases.find(f=>f.name==='noise'),first=await loadInput(f,'first','i'),second=await loadInput(f,'second','r'),task={id:'pair',imageId:'i',operation:'comparison.image',params:{referenceImageId:'r',view:'difference'}};
  await engine.load(first);await engine.load(second);const before=await engine.run(task);assert((await engine.run(task)).metrics.cache.result,'Pair result cached');await engine.unload('r');
  await engine.load({...second,pixels:first.pixels});const after=await engine.run(task);assert(!after.metrics.cache.result&&after.pixels.data.every(x=>x===0)&&await hash(before.pixels.data)!==await hash(after.pixels.data),'Reused reference identity invalidates cache even with same original bytes');
  for(const change of [{backend:'webgpu'},{params:{}},{params:{referenceImageId:'missing'}},{params:{referenceImageId:'r',view:'unknown'}},{regions:[{bounds:[0,0,2,2]}]}]){let code;try{await engine.run({...task,...change});}catch(e){code=e.code;}assert(['INVALID_INPUT','NOT_FOUND','UNSUPPORTED_BACKEND','UNSUPPORTED_REGION'].includes(code),'Explicit invalid pair/parameter error');}
  const controller=new AbortController();let cancelled=false;
  try{await engine.run({...task,params:{referenceImageId:'r',metrics:true}},{signal:controller.signal,onProgress:()=>controller.abort()});}catch(e){cancelled=e.code==='CANCELLED'&&e.imagesCleared;}
  assert(cancelled,'Hard cancellation clears both loaded images');await engine.load(first);await engine.load(second);
  const recovered=await engine.run({...task,params:{referenceImageId:'r',metrics:true}});assert(recovered.data.values.butter===f.values.butter,'Recovery after hard cancellation');
  const exported=await engine.exportResult(recovered,{format:'json'}),json=JSON.parse(new TextDecoder().decode(exported.bytes));assert(json.provenance.references[0].imageId==='r','Reference survives worker JSON export');
  const csv=await engine.exportResult(recovered,{format:'csv'});assert(new TextDecoder().decode(csv.bytes).includes('histogramCorrelationFullBins'),'CSV includes independent full-bin correlation');
  await engine.unload('i');await engine.unload('r');report.memory=(await engine.capabilities()).memory;assert(!report.memory.retainedBytes&&!report.memory.cacheBytes&&!report.memory.activeReservationBytes,'All pair memory released');
  const limited=createWorkerEngine({memoryBudgetBytes:48*1024**2});try{await limited.load(first);await limited.load(second);assert((await limited.run(task)).status==='ok','Small display works within limited budget');let code;try{await limited.run({...task,params:{referenceImageId:'r',metrics:true}});}catch(e){code=e.code;}assert(code==='MEMORY_LIMIT','Metric working-set admission');assert((await limited.capabilities()).memory.activeReservationBytes===0,'Failed reservation released');}finally{limited.dispose();}
  report.lifecycle='Two source buffers and provenance, cache ownership/invalidation on either image, same-byte reference reload, hard cancellation, JSON/CSV exports, budget admission, unload and recovery verified';return report;
 }finally{engine.dispose();}
}
