import "../../../../../runtime-context.js?v=0.31.0";
// The existing qualified float32/logarithm arithmetic, applied to one real
// already-aggregated residual plane. No duplicate quality planes are supplied.
import {energyScoreMathWGSL} from './energy-score-gpu-shader.js';
export const energySingleScoreShader=energyScoreMathWGSL+`
@group(0)@binding(0)var<storage,read> planes:array<f32>;
@group(0)@binding(1)var<storage,read> scope:array<i32>;
@group(0)@binding(2)var<storage,read> centers:array<vec4u>;
@group(0)@binding(3)var<storage,read> exceptions:array<u32>;
@group(0)@binding(4)var<storage,read> buckets:array<u32>;
@group(0)@binding(5)var<storage,read_write> output:array<vec4u>;
struct Shape{count:u32,groupsX:u32,minimumBits:u32,maximumBits:u32,centerCount:u32,pad0:u32,pad1:u32,pad2:u32};
@group(0)@binding(6)var<uniform>shape:Shape;
@compute@workgroup_size(128)fn main(@builtin(global_invocation_id)id:vec3u){
 let i=id.x+id.y*shape.groupsX*128u;if(i>=shape.count){return;}
 let panel=scope[i];if(panel<=0){output[i]=vec4u(0u);return;}
 var lo=0u;var hi=shape.centerCount;
 while(lo<hi){let mid=lo+(hi-lo)/2u;if(centers[mid].x<u32(panel)){lo=mid+1u;}else{hi=mid;}}
 if(lo>=shape.centerCount||centers[lo].x!=u32(panel)){output[i]=vec4u(0u,0u,8u,0u);return;}
 let value=energyScoreNumerator(bitcast<f32>(centers[lo].y),planes[i]);
 let score=bitcast<f32>(value.x);
 let low=select(0.0,score,score>0.0);let high=select(0.0,-score,score<0.0);
 output[i]=vec4u(bitcast<u32>(low),bitcast<u32>(high),u32(value.y!=0u),0u);
}
`;
