import{computeStoredDoubleJpeg}from'./double-jpeg-service.js';import{checkAbort}from'./errors.js';
// Original encoded evidence is retained. The derived RGB envelope is never an
// input to this detector, and is never recompressed to fabricate coefficients.
export async function sourceRegionDoubleJpeg({task,original,derived,domain,budget,signal,onProgress,version}){
 const key=task.imageId+'\0original-double-jpeg/'+domain.fingerprint,started=performance.now();checkAbort(signal);let result=budget.get(key)?.value;const cached=!!result;let free;
 try{if(!result){await derived.doubleJpegOwner?.dispose();derived.doubleJpegOwner=null;result=await computeStoredDoubleJpeg(original,{domain,budget,signal,onProgress,started,onOwner:owner=>{derived.doubleJpegOwner=owner;}});}
  checkAbort(signal);const bytes=65536+result.data.records.reduce((n,r)=>n+r.histogram.byteLength+(r.candidate_lattice?.byteLength??0)+2048,0);free=budget.reserve(bytes*3);const owned=structuredClone(result);checkAbort(signal);if(!cached)budget.put(key,{value:result,byteLength:bytes});return{id:task.id,imageId:task.imageId,operation:'jpeg.multiple',status:'ok',...owned,provenance:{engine:version,operation:'jpeg.multiple',params:{},backend:'cpu',originalSha256:original.sha256,input:'original-stored-jpeg-coefficients',sourceRegionDomain:domain.descriptor,sourceRegionFingerprint:domain.fingerprint,coefficientCoordinates:'original-encoded-grid',selectedBeforeHistogram:true,originalEncodedBytesPreserved:true,encodedSourceRewritten:false,semantics:result.semantics},metrics:{...result.engineMetrics,totalMs:performance.now()-started,nativeAnalysisCalls:cached?0:1,gpuJobs:0,cache:{result:cached},memory:budget.snapshot()}};
 }finally{free?.();}
}
