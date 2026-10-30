import "../../runtime-context.js?v=0.30.0";
export const TESSERACT_USEFUL_PRECISION='Tesseract-native-LSTM-f32-tables/1';
export const TESSERACT_NATIVE_VERSION='5.1.0-288-g2a9c1';
const SHA=/^[a-f0-9]{64}$/;
// Identical passive identity fields before work and after its existing ACK.
// Every Native instance is fresh. Before both resources and the selected
// languages have already been acquired, phase stays unknown (weak evidence).
export function tesseractUsefulFacts({parameters,cpuResource='official-complete',profile,budgetBytes,nativeVersion,modelShas,assetReady}={}){
 if(nativeVersion!==TESSERACT_NATIVE_VERSION||typeof profile?.id!=='string'||!profile.id||!Number.isSafeInteger(profile.maxWorkers)||profile.maxWorkers<1||!Number.isSafeInteger(budgetBytes)||budgetBytes<1||!Array.isArray(modelShas)||!modelShas.length||!modelShas.every(x=>SHA.test(x))||!parameters||typeof parameters!=='object')return null;
 return {operation:'various.ocr',method:'tesseract',precision:TESSERACT_USEFUL_PRECISION,parameters:structuredClone(parameters),requiresModels:true,modelShas:[...modelShas],regime:assetReady?'cold':'unknown',threads:1,profile:profile.id,runtime:'tesseract.js-core7.0.0/native-'+nativeVersion,budgetBytes,inputContract:'single-original',sourceShas:[],work:null,resourceContext:{nativeWorkerHeapBytes:128*1024**2,nativeThreadsPerWorker:1,cpuResource,cpuWorkers:profile.maxWorkers,gpuNativeWorkers:1,providerLifetime:'fresh-native-per-fragment',assetReady:assetReady===true,pgmContract:'native1536-overlap128-original-gray/1',gpuLayerContract:'96-512-608-clip100/1'}};
}
