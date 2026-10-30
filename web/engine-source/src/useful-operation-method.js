// A method is independent of its numeric parameters and presentation. Aliased
// operations share the visible tool's preference while keeping actual operation
// in scientific identities. This module reads no runtime, model, or source.
export function usefulOperationMethod(operation,params={},extras={}){
 if(operation==='tampering.copyMove.sparse')return{tool:operation,method:params.algorithm??'SIFT + G2NN + RANSAC',operation};
 if(operation==='tampering.copyMove.dense')return{tool:'tampering.copyMove.sparse',method:params.profile??params.algorithm??'PatchMatch Zernike',operation};
 if(['tampering.copyMove.brisk','tampering.copyMove.akaze','tampering.copyMove.orb'].includes(operation)){
  const method=operation==='tampering.copyMove.brisk'?(extras.detector??'brisk'):operation.slice('tampering.copyMove.'.length);
  return{tool:'tampering.copyMove.brisk',method,operation:'tampering.copyMove.'+method};
 }
 if(operation==='ai.clones.d2prl'){
  const method=extras.neuralMethod??'d2prl';return{tool:operation,method,operation:method==='d2prl'?'ai.clones.d2prl':method.startsWith('forgeryscope-')?'m2.forgeryscope':'ai.clones.segmentation'};
 }
 if(operation==='ai.clones.segmentation')return{tool:'ai.clones.d2prl',method:params.variant??'default',operation};
 if(operation==='m2.forgeryscope')return{tool:'ai.clones.d2prl',method:'forgeryscope-'+(params.profile??'auto'),operation};
 if(operation==='jpeg.multiple'||operation==='jpeg.recompression'){
  const method=operation==='jpeg.multiple'?(extras.jpegMethod??'jpeg.multiple'):'jpeg.recompression';return{tool:'jpeg.multiple',method,operation:method};
 }
 if(operation==='detail.gradient')return{tool:operation,method:params.method??'sobel',operation};
 if(operation==='noise.separation')return{tool:operation,method:String(params.mode??0),operation};
 if(operation==='various.ocr')return{tool:operation,method:params.algorithm??params.engine??'ppocr-medium',operation};
 return{tool:operation,method:'default',operation};
}

// Loaded selectors and opaque scientific input fields are replaced only by
// their already validated SHA identities in ordered sources/modelShas.
const HANDLE_FIELDS=Object.freeze({
 'comparison.image':['referenceImageId'],
 'tampering.copyMove.brisk':['maskImageId'],
 'tampering.copyMove.akaze':['maskImageId'],
 'tampering.copyMove.orb':['maskImageId'],
 'various.median':['modelId'],
 'jpeg.quality':['modelId'],
 'noise.prnu':['databaseId'],
 'metadata.c2pa':['trustAnchors']
});
export function usefulScientificParameters(operation,parameters={}){
 const out=structuredClone(parameters);for(const field of HANDLE_FIELDS[operation]??[])delete out[field];return out;
}
