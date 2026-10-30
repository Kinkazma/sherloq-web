import "../../runtime-context.js?v=0.30.0";
// Prefer a larger SIFT cap only when it is fully financed. Wasm still starts
// at its original32MiB and grows on demand; this is not a preallocation.
const MiB=1024**2;
export function initialSparseExtractionHeap(largest,family,availableBytes,overheadBytes){
 const estimate=coefficient=>Math.min(2048*MiB,32*MiB+Math.max(32*MiB,Math.ceil(largest*coefficient/(16*MiB))*16*MiB));
 const legacy=estimate(family==='AKAZE'?180:family==='SIFT-G2NN'?300:(family==='SIFT'||family==='SIFT-LightGlue')?180:family==='BRISK'?160:36);
 if(family!=='SIFT')return legacy;
 const preferred=estimate(300);
 return preferred+overheadBytes<=availableBytes?preferred:legacy;
}
