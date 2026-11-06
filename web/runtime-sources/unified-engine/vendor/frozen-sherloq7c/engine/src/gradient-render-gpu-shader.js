import "../../../../../runtime-context.js?v=0.31.0";
export const gradientRenderShader=`
struct Params {pixels:u32,offset:u32,groupsX:u32,groups:u32,mode:u32,tone:u32,histogram:u32,toneOffset:u32};
@group(0) @binding(0) var<storage,read> slopes:array<u32>;
@group(0) @binding(1) var<storage,read> tables:array<u32>;
@group(0) @binding(2) var<storage,read_write> output:array<u32>;
@group(0) @binding(3) var<storage,read_write> bins:array<atomic<u32>>;
@group(0) @binding(4) var<uniform> p:Params;
@compute @workgroup_size(64) fn render(@builtin(local_invocation_index) lane:u32,@builtin(workgroup_id) group:vec3u){
 let job=group.x+group.y*p.groupsX;if(job>=p.groups){return;}let block=(job*64u+lane)*4u;if(block>=p.pixels){return;}
 var bytes:array<u32,12>;
 for(var j=0u;j<4u;j++){
  let local=block+j;if(local>=p.pixels){break;}let packed=slopes[p.offset+local];let dx=bitcast<i32>(packed<<16u)>>16u;let dy=bitcast<i32>(packed)>>16u;
  let r=tables[u32(dx+1020)];let g=tables[2041u+u32(dy+1020)];var b=0u;
  if(p.mode==1u){b=255u;}else if(p.mode==2u){b=tables[4082u+u32(abs(dx)+abs(dy))];}else if(p.mode==3u){b=tables[4082u+r*256u+g];}
  if(p.histogram!=0u){atomicAdd(&bins[r],1u);atomicAdd(&bins[256u+g],1u);atomicAdd(&bins[512u+b],1u);}
  if(p.tone!=0u){bytes[j*3u]=tables[p.toneOffset+r];bytes[j*3u+1u]=tables[p.toneOffset+256u+g];bytes[j*3u+2u]=tables[p.toneOffset+512u+b];}
  else{bytes[j*3u]=r;bytes[j*3u+1u]=g;bytes[j*3u+2u]=b;}
 }
 let first=block*3u/4u;let words=(p.pixels*3u+3u)/4u;
 for(var k=0u;k<3u;k++){if(first+k<words){let at=k*4u;output[first+k]=bytes[at]|(bytes[at+1u]<<8u)|(bytes[at+2u]<<16u)|(bytes[at+3u]<<24u);}}
}`;
