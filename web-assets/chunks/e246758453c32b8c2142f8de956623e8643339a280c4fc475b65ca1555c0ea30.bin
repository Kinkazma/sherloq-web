import "../../runtime-context.js?v=0.30.0";
// Complete ordered native symmetric2D DWT, qualified high/low arithmetic.
export const waveletForwardGpuShader=`
fn a32(a:f32,b:f32)->f32{return fma(1.0,a,b);}
fn s32(a:f32,b:f32)->f32{return fma(-1.0,b,a);}
fn twoSum(a:f32,b:f32)->vec2<f32>{let s=a32(a,b);let v=s32(s,a);let e=a32(s32(a,s32(s,v)),s32(b,v));return vec2<f32>(s,e);}
fn ddAdd(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{let s=twoSum(a.x,b.x);return twoSum(s.x,a32(s.y,a32(a.y,b.y)));}
fn ddMul(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{let p=a.x*b.x;var e=fma(a.x,b.x,-p);e=fma(a.x,b.y,e);e=fma(a.y,b.x,e);e=fma(a.y,b.y,e);return twoSum(p,e);}
@group(0) @binding(0) var<storage,read> rawInput:array<vec2<u32>>;
@group(0) @binding(1) var<storage,read> bank:array<vec2<f32>>;
@group(0) @binding(2) var<storage,read_write> output:array<vec2<f32>>;
struct Params{width:u32,height:u32,ow:u32,oh:u32,f:u32,axis:u32,groupsX:u32,pad:u32};
@group(0) @binding(3) var<uniform> p:Params;
fn at(axisIndex:u32,line:u32)->u32{return select(line*p.width+axisIndex,axisIndex*p.width+line,p.axis==0u);}

fn sample(axisIndex:u32,line:u32,band:u32)->vec2<f32>{
 
 let point=at(axisIndex,line)+band*p.width*p.height+select(0u,p.width*p.height,(p.pad&2u)!=0u);
 if((p.pad&8u)!=0u){return vec2<f32>(f32(byte(point*3u+2u)),0.0);}
 if((p.pad&16u)!=0u){return vec2<f32>(f32(byte(point)),0.0);}
 if((p.pad&32u)!=0u){let r=byte(point*3u);let g=byte(point*3u+1u);let b=byte(point*3u+2u);return vec2<f32>(f32((9798u*r+19235u*g+3735u*b+16384u)>>15u),0.0);}
 let bits=rawInput[point];if((p.pad&1u)!=0u){return bitcast<vec2<f32>>(bits);}
let magnitude=bits.y&2147483647u;if(magnitude==0u&&bits.x==0u){return vec2<f32>(bitcast<f32>(bits.y&2147483648u),0.0);}
 let e=i32(magnitude>>20u)-1023;let top=(((magnitude&1048575u)|1048576u)<<3u)|(bits.x>>29u);let bottom=bits.x&536870911u;
 let sign=select(1.0,-1.0,(bits.y&2147483648u)!=0u);let hi=ldexp(f32(top),e-23);let lo=ldexp(f32(bottom),e-52);return twoSum(sign*hi,sign*lo);
}


fn byte(index:u32)->u32{let words=rawInput[index/8u];let word=select(words.x,words.y,index%8u>=4u);return (word>>((index%4u)*8u))&255u;}
override diagonalOnly:bool=false;
@compute @workgroup_size(128) fn down(@builtin(global_invocation_id) id:vec3<u32>){
 let index=id.x+id.y*p.groupsX*128u;let size=p.ow*p.oh;if(index>=size){return;}
 let line=select(index/p.ow,index%p.ow,p.axis==0u);
 let position=select(index%p.ow,index/p.ow,p.axis==0u);let i=position*2u+1u;
 let n=select(p.width,p.height,p.axis==0u);var lo=vec2<f32>(0.0);var hi=vec2<f32>(0.0);var j=0u;
 if(i>=n){for(var k=0u;i-j>=n;k++){let v=sample(n-1u-k,line,0u);let b=i-n-j;if(!diagonalOnly){lo=ddAdd(lo,ddMul(bank[b],v));}hi=ddAdd(hi,ddMul(bank[p.f+b],v));j++;}}
 for(;j<p.f;j++){
  var pos=0u;if(j<=i){pos=i-j;}else{let reflected=(j-i-1u)%(2u*n);pos=select(reflected,2u*n-1u-reflected,reflected>=n);}
  let v=sample(pos,line,0u);if(!diagonalOnly){lo=ddAdd(lo,ddMul(bank[j],v));}hi=ddAdd(hi,ddMul(bank[p.f+j],v));
 }
 if(diagonalOnly){output[index]=hi;}else{let offset=select(0u,size*2u,(p.pad&4u)!=0u);output[index+offset]=lo;output[index+size+offset]=hi;}
}
`;
