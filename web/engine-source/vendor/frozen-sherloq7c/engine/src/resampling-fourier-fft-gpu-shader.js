// Mixed-radix Stockham DD complex FFT; unchanged dimensions, no padding.
// Positive binary64 prepared input is decoded without scalar f32 rounding.
import {fourierViewShader} from './resampling-fourier-gpu-shader.js';
const arithmetic=fourierViewShader.split('@group(0)')[0];
export const fourierFftShader=arithmetic+`
@group(0)@binding(0)var<storage,read> realInput:array<vec2u>;
@group(0)@binding(1)var<storage,read> source:array<vec4u>;
@group(0)@binding(2)var<storage,read_write> fftOutput:array<vec4u>;
@group(0)@binding(3)var<storage,read> bank:array<vec4f>;
struct Params{n:u32,m:u32,radix:u32,axis:u32,real:u32,base:u32,groupsX:u32,count:u32};
@group(0)@binding(4)var<uniform>p:Params;
@group(0)@binding(5)var<storage,read_write>error:atomic<u32>;
fn sample(at:u32)->vec4f{if(p.real!=0u){return vec4f(raw(realInput[at]),0.0,0.0);}return bitcast<vec4f>(source[at]);}
fn complexMul(a:vec4f,b:vec4f)->vec4f{return vec4f(sub(mul(a.xy,b.xy),mul(a.zw,b.zw)),add(mul(a.xy,b.zw),mul(a.zw,b.xy)));}
fn complexAdd(a:vec4f,b:vec4f)->vec4f{return vec4f(add(a.xy,b.xy),add(a.zw,b.zw));}
@compute@workgroup_size(128)fn main(@builtin(global_invocation_id)id:vec3u){
 let index=id.x+id.y*p.groupsX*128u;if(index>=p.count){return;}
 let line=select(index/p.n,index%p.n,p.axis==0u);let t=select(index%p.n,index/p.n,p.axis==0u);
 let span=p.m*p.radix;let j=t%p.m;let group=t/span;let k=t%span;
 var sum=vec4f(0.0);
 for(var q=0u;q<p.radix;q++){
  let point=group*p.m+j+q*(p.n/p.radix);let at=select(line*p.n+point,point*p.n+line,p.axis==0u);
  let value=sample(at);let weight=bank[p.base+k*p.radix+q];sum=complexAdd(sum,complexMul(value,weight));
 }
 fftOutput[index]=bitcast<vec4u>(sum);
}
@compute@workgroup_size(128)fn packed(@builtin(global_invocation_id)id:vec3u){
 let index=id.x+id.y*p.groupsX*128u;if(index>=p.count){return;}
 let v=bitcast<vec4f>(fftOutput[index]);let r=packDdSigned(v.xy);let i=packDdSigned(v.zw);fftOutput[index]=vec4u(r.xy,i.xy);if((r.z|i.z)!=0u){atomicOr(&error,1u);}
}
fn packDdSigned(a:vec2f)->vec3u{if(a.x<0.0){let v=packDd(-a);return vec3u(v.x,v.y|2147483648u,v.z);}return packDd(a);}
struct MagnitudeShape{side:u32,outputSide:u32,offset:u32,radius:u32,radial:u32,groupsX:u32,count:u32,pad:u32};
@group(0)@binding(6)var<storage,read> radialWeights:array<vec2u>;
@group(0)@binding(7)var<storage,read_write> magnitudes:array<vec2u>;
@group(0)@binding(8)var<uniform>mag:MagnitudeShape;
fn complexMagnitude(v:vec4f)->vec2f{
 let squared=add(mul(v.xy,v.xy),mul(v.zw,v.zw));
 if(squared.x==0.0){return vec2f(0.0);}
 let h=sqrt(squared.x);let remainder=sub(squared,mul(vec2f(h,0.0),vec2f(h,0.0)));
 return add(vec2f(h,0.0),div(remainder,vec2f(2.0*h,0.0)));
}
@compute@workgroup_size(128)fn magnitude(@builtin(global_invocation_id)id:vec3u){
 let index=id.x+id.y*mag.groupsX*128u;if(index>=mag.count){return;}
 let x=index%mag.outputSide;let y=index/mag.outputSide;let center=i32(mag.outputSide/2u);
 let dx=i32(x)-center;let dy=i32(y)-center;
 if(mag.radial==0u&&u32(dx*dx+dy*dy)<=mag.radius*mag.radius){magnitudes[index]=vec2u(0u);return;}
 let sx=(x+mag.offset+mag.side/2u)%mag.side;let sy=(y+mag.offset+mag.side/2u)%mag.side;
 var v=bitcast<vec4f>(fftOutput[sy*mag.side+sx]);
 if(mag.radial!=0u){let w=raw(radialWeights[index]);v=vec4f(mul(v.xy,w),mul(v.zw,w));}
 let value=complexMagnitude(v);let packed=packDd(value);magnitudes[index]=packed.xy;
 if(packed.z!=0u||value.x!=value.x){atomicOr(&error,1u);}
}
`;
