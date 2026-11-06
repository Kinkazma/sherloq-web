import {gradientParams} from './gradient-parameters.js';
import {gradientFieldSurface} from './gradient-field.js';
import {acquireSourceRegionRecompression} from './source-region-recompression.js';
import {createRecompressedSourceRegionView} from './source-region-recompressed-view.js';
import {checkAbort} from './errors.js';
export async function sourceRegionGradientField({task,original,derived,view,domain,budget,signal,onProgress,publishResult}){
 const params=gradientParams(task.params);let recompressed,record,published=false;
 try{
  if(params.recompression)recompressed=await acquireSourceRegionRecompression({params,original,derived,view,domain,budget,signal,onProgress});
  const input=recompressed?createRecompressedSourceRegionView(view,domain,recompressed.store,{budget,signal}):view;
  record=await gradientFieldSurface(original,params,{budget,signal,onProgress:fraction=>onProgress?.({id:task.id,phase:'source-region-gradient-field',fraction}),backend:task.backend??'auto',domain,view:input,cacheKey:task.imageId+'\0source-region/gradient-field/'+domain.fingerprint+'/'+(recompressed?.codecPlan.identity??'original')});checkAbort(signal);
  const bundle=publishResult(task.imageId,record);published=true;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,semantics:record.semantics,metrics:{...record.metrics,sourceRegionPolicy:'gradient-field-omitted-taps-before-prefilter-derivative-and-tensor'},provenance:{params,gradientMethod:params.method,gradientView:params.view,sourceRegionDomain:domain.descriptor,excludedParticipation:'omitted-before-prefilter-derivative-and-tensor',presentationOutsideAnalysedSupport:'original-unanalysed',originalEncodedBytesPreserved:true,...(recompressed?{recompression:recompressed.provenance}:{})}};
 }finally{if(record&&!published)await Promise.allSettled([record.surface.dispose(),...Object.values(record.maskRecords??{}).map(r=>r.surface.dispose())]);await recompressed?.release();}
}
