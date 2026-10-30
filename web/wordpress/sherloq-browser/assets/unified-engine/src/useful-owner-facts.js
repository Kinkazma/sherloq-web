import "../../runtime-context.js?v=0.30.0";
const SHA=/^[a-f0-9]{64}$/;
export function configuredShas(value){
 const found=new Set(),seen=new Set();let nodes=0;
 const visit=(v,depth=0)=>{if(!v||typeof v!=='object'||ArrayBuffer.isView(v)||v instanceof ArrayBuffer||seen.has(v)||depth>24||++nodes>8192)return;seen.add(v);for(const[k,x]of Object.entries(v)){if(typeof x==='string'&&/sha(?:256)?$/i.test(k)&&SHA.test(x))found.add(x);else if(Array.isArray(x)&&/modelShas/i.test(k)){for(const sha of x)if(typeof sha==='string'&&SHA.test(sha))found.add(sha);}else if(x&&typeof x==='object')visit(x,depth+1);}};visit(value);return[...found].sort();
}
export function unknownOwner(task,{image,version,profile,budget,cpuKernel,method='default',parameters,precision,modelShas=[],requiresModels=false,gpu=false,ownerClass,historicalBackend='cpu',inputs=[],context={},work=null}={}){
 if(image?.provenance?.decoder==='caller'||!Number.isSafeInteger(profile?.maxWorkers)||profile.maxWorkers<1)return null;
 const threads=cpuKernel==='reference'?1:Math.min(32,profile.maxWorkers);return{schema:'sherloq.useful-operation-owner/1',operation:task.operation,method,parameters,precision,modelShas:[...new Set(modelShas)].sort(),requiresModels,codeSha256:context.codeSha256,regime:'unknown',threads,profile:profile.id,runtime:version,budgetBytes:budget.limit,inputContract:inputs.length?'ordered-original-and-references':'single-original',sourceShas:inputs,performanceIdentityComplete:(!requiresModels||modelShas.length>0)&&inputs.every(x=>SHA.test(x??'')),resourceContext:{ownerClass,threadSemantics:'configured maximum arithmetic actors; completed metrics retain actual use',sourceLayout:image.segmented?'segmented':'contiguous',sourceStorage:image.surface?.descriptor?.storage??image.surface?.storage??image.store?.storage??image.session?.backend??'unknown',cpuKernel,providerPhase:'unknown',workCategory:task.operation+'/'+method,workContract:'registered-complete-operation-v1',...context},work,historicalBackend,admission:{cpu:true,webgpu:gpu&&!!globalThis.navigator?.gpu},numericAdmissible:{cpu:true,webgpu:gpu}};
}
export function stageCacheHit(answer){
 const m=answer?.metrics??{},d=answer?.data?.metadata??{},stage=d.stageCache??m.cache?.stages??{};
 return m.cache?.result===true||m.cache?.analysis===true||m.cache?.neural===true||m.cache?.coreAnalysis===true||m.cache?.field===true||m.analysisCacheHit===true||m.analysisCached===true||d.result_reused===true||d.proposals_reused===true||Object.values(stage).some(v=>v===true)||Array.isArray(m.cache?.windowStages)&&m.cache.windowStages.some(w=>Object.values(w.stages??{}).some(v=>v===true));
}

// Categories are only weak hints from completed human comparisons. Different
// scientific operations remain distinct in analysis/implementation identities.
export function usefulOwnerWorkContract(owner){
 if(!owner)return null;const context={...owner.resourceContext},out={...owner,resourceContext:context};
 context.workCategory??=owner.operation+'/'+owner.method;context.workContract??='registered-complete-operation-v1';
 if(['jpeg.recompression','jpeg.quality'].includes(owner.operation)){
  out.precision='Native gray JPEG101 loss/curve with optional fixed CPU quality prediction';context.ownerClass='native-gray-JPEG101-pipeline';context.workCategory='native-gray-JPEG101';context.workContract='weak-complete-JPEG101-with-optional-CPU-tail-v1';context.workParameters=[];
 }
 if(['tampering.copyMove.brisk','tampering.copyMove.akaze','tampering.copyMove.orb'].includes(owner.operation)){
  out.precision='Registered Native-compatible CPU keypoints; exact integer Hamming and geometry';context.ownerClass='native-binary-keypoints-Hamming-pipeline';context.workCategory='native-binary-Hamming';context.workContract='weak-complete-binary-detector-Hamming32to64-v1';context.workParameters=['response','matching','distance','minimum'];
 }
 if(owner.operation==='tampering.copyMove.sparse'&&['ALIKED','ALIKED rotation'].includes(owner.method)){
  context.workCategory='native-ALIKED-float-distance128';context.workContract='weak-complete-ALIKED-CPUfeatures-float-distance128-v1';context.workParameters=['limit','radius','minimum','threshold','tolerance','model','geometricThreshold','geometricMinimum','compare','reflections','autoRadius','compact','independent','regions','excluded','guides','legacyTask','nativeTask'];
 }
 return out;
}
