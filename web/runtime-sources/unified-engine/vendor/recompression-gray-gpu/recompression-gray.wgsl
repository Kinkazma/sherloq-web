// Format-independent integer gray/MAE stage. No transform or image codec.
struct Params { pixels:u32,groupsX:u32,groups:u32,pad:u32 };
struct Sum64 { low:atomic<u32>,high:atomic<u32> };
@group(0) @binding(0) var<storage,read> original:array<u32>;
@group(0) @binding(1) var<storage,read> decoded:array<u32>;
@group(0) @binding(3) var<storage,read_write> result:Sum64;
@group(0) @binding(4) var<uniform> p:Params;
fn originalByte(at:u32)->u32{return(original[at/4u]>>((at%4u)*8u))&255u;}
fn decodedByte(at:u32)->u32{return(decoded[at/4u]>>((at%4u)*8u))&255u;}
fn gray(r:u32,g:u32,b:u32)->u32{return(r*9798u+g*19235u+b*3735u+16384u)>>15u;}
var<workgroup> losses:array<u32,256>;
@compute @workgroup_size(256) fn pair_loss(@builtin(local_invocation_index) lane:u32,@builtin(workgroup_id) group:vec3u){
 let block=group.x+group.y*p.groupsX;if(block>=p.groups){return;}let index=block*256u+lane;var loss=0u;
 if(index<p.pixels){let at=index*3u;let a=gray(originalByte(at),originalByte(at+1u),originalByte(at+2u));let b=gray(decodedByte(at),decodedByte(at+1u),decodedByte(at+2u));loss=max(a,b)-min(a,b);}
 losses[lane]=loss;workgroupBarrier();for(var stride=128u;stride>0u;stride/=2u){if(lane<stride){losses[lane]+=losses[lane+stride];}workgroupBarrier();}
 if(lane==0u){let sum=losses[0];let before=atomicAdd(&result.low,sum);if(before+sum<before){atomicAdd(&result.high,1u);}}
}
