// Independent direct-convolution loop tiling. Physical data reuse only: each
// output retains the current KY -> KX -> IC ordered f32 FMA chain, then bias.
export function sharedConvolutionShader(channels,kernel){
 if(!Number.isInteger(channels)||channels<32||channels%32!==0||!Number.isInteger(kernel)||kernel<1||kernel>13)throw new TypeError('Admitted shared MPS convolution shape required');
 const K=channels*kernel*kernel,reductionTile=kernel===5||kernel===7?16:32;
 return String.raw`
struct Shape{ih:u32,iw:u32,oh:u32,ow:u32,oc:u32,pad:u32,count:u32,reserved:u32,ranges:u32,stride:u32,groupOc:u32,firstProduct:u32,tailStart:u32,pad0:u32,pad1:u32,pad2:u32};
@group(0) @binding(0) var<storage,read> input:array<f32>;
@group(0) @binding(1) var<storage,read> weights:array<f32>;
@group(0) @binding(2) var<storage,read> bias:array<f32>;
@group(0) @binding(3) var<storage,read_write> output:array<f32>;
@group(0) @binding(4) var<uniform> shape:Shape;
@group(0) @binding(5) var<storage,read> bias_domains:array<vec2<u32>>;
var<workgroup> inputTile:array<f32,${reductionTile*32}>;
// K-major puts the 32 output-channel weights in adjacent banks.
var<workgroup> weightTile:array<f32,${reductionTile*32}>;
fn writeOutputs(channel:u32,pixelBase:u32,pixel4:u32,values:vec4<f32>){
 let plane=shape.oh*shape.ow;if(channel<shape.oc){for(var lane=0u;lane<4u;lane=lane+1u){let pixel=pixelBase+pixel4+lane;if(pixel<plane){
  var value=values[lane];var after=false;for(var r=0u;r<shape.ranges;r=r+1u){if(pixel>=bias_domains[r].x&&pixel<bias_domains[r].y){after=true;}}
  if(after){value=value+bias[channel];}output[channel*plane+pixel]=value;
 }}}
}
@compute @workgroup_size(8,8,1) fn main(@builtin(workgroup_id) group:vec3<u32>,@builtin(local_invocation_id) local:vec3<u32>,@builtin(local_invocation_index) thread:u32){
 let plane=shape.oh*shape.ow;let pixelBase=group.x*32u;let channel=group.y*32u+local.x*4u;let pixel4=local.y*4u;
 var acc0=vec4<f32>(0.0);var acc1=vec4<f32>(0.0);var acc2=vec4<f32>(0.0);var acc3=vec4<f32>(0.0);
 for(var base=0u;base<${K}u;base=base+${reductionTile}u){
  for(var load=thread;load<${reductionTile*32}u;load=load+64u){
   let q=base+load/32u;let pixel=pixelBase+load%32u;
   let ic=q%${channels}u;let spatial=q/${channels}u;let ky=spatial/${kernel}u;let kx=spatial%${kernel}u;
   var value=0.0;
   if(pixel<plane){let y=i32(pixel/shape.ow)*i32(shape.stride)-i32(shape.pad)+i32(ky);let x=i32(pixel%shape.ow)*i32(shape.stride)-i32(shape.pad)+i32(kx);
    if(y>=0&&x>=0&&y<i32(shape.ih)&&x<i32(shape.iw)){value=input[(ic*shape.ih+u32(y))*shape.iw+u32(x)];}
   }
   inputTile[load]=value;
  }
  for(var load=thread;load<${reductionTile*32}u;load=load+64u){
   let k=load/32u;let oc=group.y*32u+load%32u;let q=base+k;
   let ic=q%${channels}u;let spatial=q/${channels}u;let ky=spatial/${kernel}u;let kx=spatial%${kernel}u;
   var value=0.0;if(oc<shape.oc){value=weights[oc*${K}u+ic*${kernel*kernel}u+ky*${kernel}u+kx];}weightTile[load]=value;
  }
  workgroupBarrier();
  for(var k=0u;k<${reductionTile}u;k=k+1u){
   let at=k*32u+pixel4;let values=vec4<f32>(inputTile[at],inputTile[at+1u],inputTile[at+2u],inputTile[at+3u]);
   let w=k*32u+local.x*4u;
   acc0=fma(values,vec4<f32>(weightTile[w]),acc0);acc1=fma(values,vec4<f32>(weightTile[w+1u]),acc1);
   acc2=fma(values,vec4<f32>(weightTile[w+2u]),acc2);acc3=fma(values,vec4<f32>(weightTile[w+3u]),acc3);
  }
  workgroupBarrier();
 }
 // All invocations reached every barrier, including inactive pixels/channels.
 writeOutputs(channel,pixelBase,pixel4,acc0);writeOutputs(channel+1u,pixelBase,pixel4,acc1);
 writeOutputs(channel+2u,pixelBase,pixel4,acc2);writeOutputs(channel+3u,pixelBase,pixel4,acc3);
}`;
}
