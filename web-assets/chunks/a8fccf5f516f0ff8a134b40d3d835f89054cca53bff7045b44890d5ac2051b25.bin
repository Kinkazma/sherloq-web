// Integer view of the same finite / bound / nonzero admission used by445e.
// The private selected buffers have one writer (the unchanged scorer). Any
// failed certificate invalidates the whole uncommitted iteration, not one lane.
export const ITERATION_CERTIFICATE_WGSL=String.raw`
struct Certificate{n:u32,stage:u32,pad0:u32,pad1:u32};
@group(0) @binding(0) var<storage,read> selected:array<u32>;
@group(0) @binding(1) var<storage,read_write> rejected:array<atomic<u32>>;
@group(0) @binding(2) var<uniform> certificate:Certificate;
fn validWord(word:u32)->bool{let magnitude=word&2147483647u;return magnitude<=1138753536u&&(magnitude==0u||magnitude>=226492416u);}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=certificate.n){return;}
 if(!validWord(selected[i])||!validWord(selected[certificate.n+i])){atomicMin(&rejected[0],certificate.stage*certificate.n+i);}
}`;
