import "../../runtime-context.js?v=0.30.0";
// Exact-rounding ELA score preparation; no thresholds or scientific parameters changed.
import {fourierViewShader} from './resampling-fourier-gpu-shader.js';
const arithmetic=fourierViewShader.split('@group(0)')[0];
export const energyScoreMathWGSL=arithmetic+`fn roundingUnresolved(value:vec2f)->bool{
 if(value.x==0.0&&value.y==0.0){return false;}
 let bits=bitcast<u32>(value.x);let positive=value.x>=0.0;
 let upward=value.y>=0.0;
 var nextBits=bits;
 if(positive==upward){nextBits++;}else{nextBits--;}
 let gap=abs(bitcast<f32>(nextBits)-value.x);
 let margin=gap*0.5-abs(value.y);
 // Conservative guard over the qualified normal RGB8 residual domain.
 return margin<=max(abs(value.x),1e-30)*2e-11;
}
fn nativeLogException(key:u32)->vec2u{
 let bucket=(key-shape.minimumBits)>>16u;
 var lo=buckets[bucket];var hi=buckets[bucket+1u];
 let end=hi;
 while(lo<hi){let mid=lo+((hi-lo)>>2u)*2u;if(exceptions[mid]<key){lo=mid+2u;}else{hi=mid;}}
 if(lo<end&&exceptions[lo]==key){return vec2u(exceptions[lo+1u],1u);}
 return vec2u(0u);
}

fn energyScoreNumerator(numerator:f32,plane:f32)->vec2u{
 var flags=0u;
 let divided=div(vec2f(numerator,0.0),vec2f(a32(plane,0.25),0.0));
 let ratio=divided.x;if(roundingUnresolved(divided)){flags|=1u;}
 let key=bitcast<u32>(ratio);
 if(key<shape.minimumBits||key>shape.maximumBits){return vec2u(0u,8u);}
 let exception=nativeLogException(key);var logValue:f32;
 if(exception.y!=0u){logValue=bitcast<f32>(exception.x);}else{
  let computed=logarithm(vec2f(ratio,0.0));logValue=computed.x;
  if(roundingUnresolved(computed)){flags|=2u;}
 }
 let score=div(vec2f(logValue,0.0),vec2f(0.2,0.0));
 if(roundingUnresolved(score)){flags|=4u;}
 return vec2u(bitcast<u32>(score.x),flags);
}
`;
export const energyScoresShader=energyScoreMathWGSL+`
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
 let center=centers[lo];
 let a=energyScoreNumerator(bitcast<f32>(center.y),planes[i]);
 let b=energyScoreNumerator(bitcast<f32>(center.z),planes[shape.count+i]);
 let c=energyScoreNumerator(bitcast<f32>(center.w),planes[shape.count*2u+i]);
 let x=bitcast<f32>(a.x);let y=bitcast<f32>(b.x);let z=bitcast<f32>(c.x);var median:f32;
 if(x>y){if(y>z){median=y;}else{median=min(x,z);}}else{if(x>z){median=x;}else{median=min(y,z);}}
 let low=select(0.0,median,median>0.0);let high=select(0.0,-median,median<0.0);
 let flags=u32(a.y!=0u)|(u32(b.y!=0u)<<1u)|(u32(c.y!=0u)<<2u);
 output[i]=vec4u(bitcast<u32>(low),bitcast<u32>(high),flags,0u);
}
`;
