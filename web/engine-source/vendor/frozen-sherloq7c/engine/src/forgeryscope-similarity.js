import {forgeryscopeFloatSum} from './forgeryscope-geometry.js';
import {requireValue} from './errors.js';
const f=Math.fround;
export function normalizeLaneEmbeddings(vectors){
  requireValue(vectors instanceof Float32Array&&vectors.length%1024===0,'Invalid lane embeddings.');
  const normalized=new Float32Array(vectors.length),squared=new Float32Array(1024);
  for(let start=0;start<vectors.length;start+=1024){
    for(let d=0;d<1024;d++)squared[d]=f(vectors[start+d]*vectors[start+d]);
    const divisor=f(f(Math.sqrt(forgeryscopeFloatSum(squared)))+f(1e-8));
    for(let d=0;d<1024;d++)normalized[start+d]=f(vectors[start+d]/divisor);
  }
  return normalized;
}
/** Exact matrix-dot operation, streamed by rows to avoid quadratic storage. */
export async function forgeryscopeSimilarityRow(pool,vectors,row,options={}){
  const n=vectors.length/1024;
  requireValue(Number.isInteger(row)&&row>=0&&row<n,'Invalid similarity row.');
  const run=await pool.run('similarity',{
    a:{data:vectors.subarray(row*1024,(row+1)*1024),dims:[1,1024]},
    b:{data:vectors,dims:[n,1024]}
  },{...options,cpuRequired:true,workspaceBytes:n*8192,outputBytes:n*4});
  return {scores:run.result.scores.data,release:run.release};
}
