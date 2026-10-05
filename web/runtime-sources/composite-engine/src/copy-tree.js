import {EngineError,requireValue,checkAbort} from './errors.js';
// The native cKDTree query is intentionally unsorted. A geometric candidate
// grid can replace the query cost, but not its leaf-order permutation.
export async function copyTreeRanks(coords,{signal,reserveMemory}={}){
 requireValue(coords instanceof Float64Array&&coords.length%2===0&&coords.length<=2000000&&coords.every(Number.isFinite)&&typeof reserveMemory==='function','Invalid copy spatial index.');
 reserveMemory(64*1024**2+coords.length*2);checkAbort(signal);
 const {default:create}=await import('../vendor/copy-tree/copy-tree.js'),module=await create();let cp=0,op=0;
 try{
  checkAbort(signal);const n=coords.length/2;cp=module._malloc(Math.max(8,coords.byteLength));op=module._malloc(Math.max(8,n*4));if(!cp||!op)throw new EngineError('MEMORY_LIMIT','Copy spatial index allocation failed.');
  module.HEAPU8.set(new Uint8Array(coords.buffer,coords.byteOffset,coords.byteLength),cp);if(!module._copy_tree_order(cp,op,n))throw new EngineError('INVALID_INPUT','Copy spatial index failed.');
  const ranks=new Uint32Array(n);for(let i=0;i<n;i++)ranks[module.HEAPU32[op/4+i]]=i;checkAbort(signal);return ranks;
 }finally{if(cp)module._free(cp);if(op)module._free(op);}
}
