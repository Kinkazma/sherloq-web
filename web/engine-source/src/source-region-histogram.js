import {segmentedHistogram} from './segmented-histogram.js';
import {histogramParams} from './histogram.js';

/** Histogram reduction consumes observations only. Packing spans is valid
 * here because this maintained operator is invariant to pixel permutation;
 * spatial operators must use their own native-coordinate adapter. */
export async function sourceRegionHistogram(view,params,{budget,signal,onProgress}={}){
 const observations=view.domain.countIncluded;
 const store={byteLength:observations*3,async visit(visitor,{signal:extra}={}){
  let offset=0;await view.visitIncluded(async pixels=>{await visitor(pixels.data,offset);offset+=pixels.data.length;},{signal:extra??signal});
 }};
 const result=await segmentedHistogram(store,histogramParams(params),{budget,signal,onProgress});
 return{...result,sourceRegionDomain:view.domain.descriptor,semantics:'Exact maintained integer histogram over admitted original pixels only. Excluded pixels do not contribute zeros, counts, unique colours or normalization. Source coordinates and encoded bytes remain available separately.'};
}
