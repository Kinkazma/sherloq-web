import "../../runtime-context.js?v=0.30.0";
import {npyHeader} from './npz.js';
import {requireValue} from './errors.js';

/** Packed cells have no invented image-grid shape. Context offsets, native
 * grid shapes and Original bounds remain in the existing metadata payload. */
export function cfaStrictNpzEntries(result) {
 const d=result?.data,n=d?.cellCount;requireValue(d?.metadata?.fragmented===true&&Number.isSafeInteger(n)&&n>=0,'Invalid fragmented CFA result.');
 const shapes={probabilities:[4,4,n],native_grids:[4,n],native_local_grid:[n],native_suspicion:[n],grids:[4,n],means:[4],local_grid:[n],suspicion:[n]},entries=[];
 for(const[key,shape]of Object.entries(shapes)) {
  const value=d[key],floating=!['local_grid','native_local_grid'].includes(key);
  requireValue(value instanceof(floating?Float32Array:Uint8Array)&&value.length===shape.reduce((a,b)=>a*b,1),'Invalid fragmented CFA export field.');
  entries.push({key,value,header:npyHeader(floating?'<f4':'|u1',shape),bytes:value.byteLength,floating});
 }
 return entries;
}
