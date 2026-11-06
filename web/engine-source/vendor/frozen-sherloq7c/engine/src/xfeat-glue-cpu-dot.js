import {fetchXfeatGlueAsset} from './xfeat-glue-global-assets.js';
import {checkAbort} from './errors.js';
// SHERLOQ exact-FMA qualification. Native input values/weights remain float32.
// Existing hardware SIMD is admitted by instruction support under the accepted f32 tolerance; no startup numeric qualification.
const sameBits=(a,b)=>{const x=new Uint32Array(a.buffer,a.byteOffset,a.length),y=new Uint32Array(b.buffer,b.byteOffset,b.length);let differences=0;for(let i=0;i<x.length;i++)differences+=x[i]!==y[i]&&!(Number.isNaN(a[i])&&Number.isNaN(b[i]));return differences;};
function workspace(module,bytes){const start=Math.ceil(Number(module.__heap_base.value)/64)*64,end=start+bytes;if(end>536870912)throw Error('Cross-dot workspace exceeds its explicit maximum');if(end>module.memory.buffer.byteLength)module.memory.grow(Math.ceil((end-module.memory.buffer.byteLength)/65536));return start;}
function triplets(module,a,b,c){const bytes=a.byteLength,at=workspace(module,bytes*4),heap=new Float32Array(module.memory.buffer);heap.set(a,at/4);heap.set(b,(at+bytes)/4);heap.set(c,(at+bytes*2)/4);module.fma_triplets(at,at+bytes,at+bytes*2,at+bytes*3,a.length/4);return heap.slice((at+bytes*3)/4,(at+bytes*4)/4);}
function dot(module,q,k,rows,keys,dim){
 if(![rows,keys,dim].every(v=>Number.isSafeInteger(v)&&v>0)||!(q instanceof Float32Array)||!(k instanceof Float32Array)||q.length!==rows*dim||k.length!==keys*dim)throw Error('Invalid cross-dot shape');
 const keys4=Math.ceil(keys/4)*4,qBytes=q.byteLength,kBytes=keys4*dim*4,oBytes=rows*keys4*4,at=workspace(module,qBytes+kBytes+oBytes),heap=new Float32Array(module.memory.buffer),ki=(at+qBytes)/4,oi=(at+qBytes+kBytes)/4;
 heap.set(q,at/4);heap.fill(0,ki,ki+keys4*dim);for(let d=0;d<dim;d++)for(let key=0;key<keys;key++)heap[ki+d*keys4+key]=k[key*dim+d];
 module.cross_dot(at,at+qBytes,at+qBytes+kBytes,rows,keys4,dim);const output=new Float32Array(rows*keys);for(let row=0;row<rows;row++)output.set(heap.subarray(oi+row*keys4,oi+row*keys4+keys),row*keys);return output;
}
export async function createCrossDotFma(base,{signal}={}){
 const strict=(await WebAssembly.instantiate(await fetchXfeatGlueAsset('cross-dot-fma',signal),{})).instance.exports;
 const relaxedBytes=await fetchXfeatGlueAsset('cross-dot-relaxed-fma',signal);let relaxed,capabilityFailure=null;try{relaxed=(await WebAssembly.instantiate(relaxedBytes,{})).instance.exports;}catch(error){checkAbort(signal);if(!(error instanceof WebAssembly.CompileError))throw error;capabilityFailure=String(error.message??error);}
 const qualified=!!relaxed;
 return{qualification:{cases:0,differences:null,qualified,capabilityFailure,capabilityOnly:true,bitExactGuarantee:false,anchor:'Existing pinned relaxed SIMD FMA when supported; portable strict fallback. No numeric startup probes.'},dot(q,k,rows,keys,dim,{hardware=false,compareHardware=false}={}){if(hardware&&!qualified)throw Error('Hardware FMA is unavailable');const output=dot(hardware?relaxed:strict,q,k,rows,keys,dim);return{output,hardwareDifferences:null,heapBytes:strict.memory.buffer.byteLength+(relaxed?.memory.buffer.byteLength??0),implementation:hardware?'native-relaxed-SIMD-fma':'strict-libc-fmaf'};}};
}
