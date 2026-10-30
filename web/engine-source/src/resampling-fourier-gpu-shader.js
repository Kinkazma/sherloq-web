// Private Fourier presentation probe. The native FFT/magnitude stays unchanged.
// Binary64 input is decoded into a high/low f32 pair; no f64 operand is rounded
// to one f32 before normalization. All RGB threshold ambiguities are replayed
// with the original Math.pow and the original palette on the CPU.
const unpackedFourierViewShader=`
fn a32(a:f32,b:f32)->f32{return fma(1.0,a,b);}
fn s32(a:f32,b:f32)->f32{return fma(-1.0,b,a);}
fn twoSum(a:f32,b:f32)->vec2f{let s=a32(a,b);let v=s32(s,a);let e=a32(s32(a,s32(s,v)),s32(b,v));return vec2f(s,e);}
fn add(a:vec2f,b:vec2f)->vec2f{let s=twoSum(a.x,b.x);return twoSum(s.x,a32(s.y,a32(a.y,b.y)));}
fn neg(a:vec2f)->vec2f{return -a;}
fn sub(a:vec2f,b:vec2f)->vec2f{return add(a,-b);}
fn mul(a:vec2f,b:vec2f)->vec2f{let p=a.x*b.x;var e=fma(a.x,b.x,-p);e=fma(a.x,b.y,e);e=fma(a.y,b.x,e);e=fma(a.y,b.y,e);return twoSum(p,e);}
fn div(a:vec2f,b:vec2f)->vec2f{let q=a.x/b.x;let r=sub(a,mul(b,vec2f(q,0.0)));let c=a32(r.x,r.y)/b.x;return twoSum(q,c);}
fn scale(a:vec2f,e:i32)->vec2f{return vec2f(ldexp(a.x,e),ldexp(a.y,e));}
fn raw(bits:vec2u)->vec2f{let magnitude=bits.y&2147483647u;if(magnitude==0u&&bits.x==0u){return vec2f(0.0);}let e=i32(magnitude>>20u)-1023;let top=(((magnitude&1048575u)|1048576u)<<3u)|(bits.x>>29u);let bottom=bits.x&536870911u;return twoSum(ldexp(f32(top),e-23),ldexp(f32(bottom),e-52));}
fn logarithm(x:vec2f)->vec2f{
 var e=i32((bitcast<u32>(x.x)>>23u)&255u)-127;var m=scale(x,-e);
 if(m.x>1.4142135623730951){m=scale(m,-1);e++;}
 let z=div(sub(m,vec2f(1.0,0.0)),add(m,vec2f(1.0,0.0)));let zz=mul(z,z);
 var term=z;var sum=z;
 for(var k=1u;k<=12u;k++){term=mul(term,zz);sum=add(sum,div(term,vec2f(f32(k*2u+1u),0.0)));}
 return add(scale(sum,1),mul(vec2f(f32(e),0.0),vec2f(0.6931471824645996,-1.904654323148236e-9)));
}
fn exponential(x:vec2f)->vec2f{
 // At most 2^24 rescaling: clamping below exp(-100) changes the field by
 // < 6.3e-37, many orders below the permitted absolute1e-4.
 if(x.x < -100.0){return vec2f(0.0);}
 let n=i32(round(x.x*1.4426950408889634));
 let r=sub(x,mul(vec2f(f32(n),0.0),vec2f(0.6931471824645996,-1.904654323148236e-9)));
 var term=vec2f(1.0,0.0);var sum=term;
 for(var k=1u;k<=16u;k++){term=div(mul(term,r),vec2f(f32(k),0.0));sum=add(sum,term);}
 return scale(sum,n);
}
fn power(x:vec2f,gamma:vec2f)->vec2f{
 if(gamma.x==0.0&&gamma.y==0.0){return vec2f(1.0,0.0);}
 if(x.x==0.0){return vec2f(0.0);}
 if(gamma.y==0.0&&gamma.x==floor(gamma.x)){
  var v=vec2f(1.0,0.0);for(var k=0u;k<u32(gamma.x);k++){v=mul(v,x);}return v;
 }
 return exponential(mul(logarithm(x),gamma));
}
@group(0)@binding(0)var<storage,read> input:array<vec2u>;
@group(0)@binding(1)var<storage,read> parameters:array<vec2u>;
@group(0)@binding(2)var<storage,read> palette:array<u32>;
@group(0)@binding(3)var<storage,read_write> output:array<vec4u>;
struct Shape{count:u32,groupsX:u32,rescale:u32,pad:u32};
@group(0)@binding(4)var<uniform>s:Shape;
@compute@workgroup_size(128)fn main(@builtin(global_invocation_id)id:vec3u){
 let i=id.x+id.y*s.groupsX*128u;if(i>=s.count){return;}
 let high=raw(parameters[0]);let gamma=raw(parameters[1]);var v=vec2f(0.0);
 if(high.x>0.0){v=div(raw(input[i]),high);}
 v=power(v,gamma);if(s.rescale!=0u){v=mul(v,high);}
 let scaled=mul(v,vec2f(256.0,0.0));let base=floor(scaled.x);var bin=i32(base);if(base==scaled.x&&scaled.y<0.0){bin--;}
 let gray=palette[u32(clamp(bin,0,255))];
 // The tested DD bound is much tighter. Retain a conservative1e-4 RGB
 // boundary neighbourhood so the numeric tolerance never changes a bin.
 let boundary=round(scaled.x);let fraction=abs(scaled.x-boundary);let near=boundary>=1.0&&boundary<=255.0&&fraction<=0.0257;
 output[i]=vec4u(bitcast<vec2u>(v),gray,select(0u,1u,near));
}
`;

// Encode a nonoverlapping positive DD pair into binary64 bits. Discarding a
// low component below the 53rd bit changes the value by <= two binary64 ULPs,
// bounded by 7.5e-9 on the admitted <=2^24 presentation domain. Unexpected DD
// overlap/sign is explicitly flagged for unchanged CPU value+palette replay.
export const packDdShader=`
fn packDd(a:vec2f)->vec3u{
 let h=bitcast<u32>(a.x);let l=bitcast<u32>(a.y);let exponent=(h>>23u)&255u;
 if(exponent==0u){return vec3u(0u);}
 if((h&2147483648u)!=0u||exponent==255u){return vec3u(0u,0u,1u);}
 var low=(h&8388607u)<<29u;var high=((exponent+896u)<<20u)|((h&8388607u)>>3u);
 let le=(l>>23u)&255u;if(le==0u){return vec3u(low,high,0u);}
 let delta=i32(exponent)-i32(le);if(delta<24||le==255u){return vec3u(0u,0u,1u);}
 var correction=0u;let m=(l&8388607u)|8388608u;
 if(delta<=29){correction=m<<u32(29-delta);}else if(delta<53){correction=m>>u32(delta-29);}
 // Immediately below a power of two the binary64 spacing halves. This is
 // exponent normalization, not subtraction in the encoded exponent field.
 if((h&8388607u)==0u&&(l&2147483648u)!=0u){correction*=2u;}
 let before=low;if((l&2147483648u)==0u){low+=correction;if(low<before){high++;}}else{low-=correction;if(low>before){high--;}}
 return vec3u(low,high,0u);
}
`;
export const fourierViewShader=unpackedFourierViewShader
 .replace('@group(0)@binding(0)',packDdShader+'\n@group(0)@binding(0)')
 .replace('output:array<vec4u>','output:array<u32>')
 .replace('output[i]=vec4u(bitcast<vec2u>(v),gray,select(0u,1u,near));','let packed=packDd(v);output[i*2u]=packed.x;output[i*2u+1u]=packed.y;output[s.count*2u+i]=gray|select(0u,256u,near)|(packed.z<<9u);');
