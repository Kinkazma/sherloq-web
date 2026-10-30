/** Exact software binary64 for a deliberately bounded positive domain.
 * API: positiveFma64(x,y,z) -> vec3<u32>(low,high,status), little-endian
 * IEEE754 binary64 bit pairs. status=1 requires the unchanged CPU path.
 * x,y: +0 or positive normal with unbiased exponent [-400,400].
 * z: +0 or positive normal with exponent [-800,800]. Result must be normal
 * or +0; negatives, signed zero, subnormals, NaN and infinity are rejected.
 * Every numerical operation is u32. No f32 approximation is used.
 * 53x53 product, 128-bit sticky alignment, one final ties-even rounding.
 * Qualification:216384 independent native-fma cases, zero differing bits.
 */
export const GPU_POSITIVE_F64_WGSL=`// Diagnostic, bounded positive-normal binary64 arithmetic. Every numerical
// operation below is integer; there is no reduced-precision floating result.
fn pf64Add128(a:vec4<u32>,b:vec4<u32>)->vec4<u32>{var out=vec4<u32>(0u);var carry=0u;for(var i=0u;i<4u;i++){let s=a[i]+b[i];let c=u32(s<a[i]);let t=s+carry;carry=c|u32(t<s);out[i]=t;}return out;}
fn pf64Mul32(a:u32,b:u32)->vec2<u32>{let a0=a&65535u;let a1=a>>16u;let b0=b&65535u;let b1=b>>16u;let p0=a0*b0;let p1=a0*b1;let p2=a1*b0;let p3=a1*b1;let mid=(p0>>16u)+(p1&65535u)+(p2&65535u);return vec2<u32>((p0&65535u)|(mid<<16u),p3+(p1>>16u)+(p2>>16u)+(mid>>16u));}
fn pf64Mul53(a:vec2<u32>,b:vec2<u32>)->vec4<u32>{let aa=pf64Mul32(a.x,b.x);let ab=pf64Mul32(a.x,b.y);let ba=pf64Mul32(a.y,b.x);let bb=pf64Mul32(a.y,b.y);return pf64Add128(pf64Add128(pf64Add128(vec4<u32>(aa,0u,0u),vec4<u32>(0u,ab,0u)),vec4<u32>(0u,ba,0u)),vec4<u32>(0u,0u,bb));}
fn pf64ShiftLeft128(a:vec4<u32>,shift:u32)->vec4<u32>{var out=vec4<u32>(0u);if(shift>=128u){return out;}let words=shift>>5u;let bits=shift&31u;for(var i=0u;i<4u;i++){if(i>=words){out[i]=a[i-words]<<bits;if(bits!=0u&&i>words){out[i]|=a[i-words-1u]>>(32u-bits);}}}return out;}
fn pf64ShiftRight128(a:vec4<u32>,shift:u32)->vec4<u32>{var out=vec4<u32>(0u);if(shift>=128u){return out;}let words=shift>>5u;let bits=shift&31u;for(var i=0u;i<4u;i++){if(i+words<4u){out[i]=a[i+words]>>bits;if(bits!=0u&&i+words+1u<4u){out[i]|=a[i+words+1u]<<(32u-bits);}}}return out;}
fn pf64Lost128(a:vec4<u32>,shift:u32)->bool{if(shift>=128u){return any(a!=vec4<u32>(0u));}let words=shift>>5u;let bits=shift&31u;var lost=false;for(var i=0u;i<4u;i++){if(i<words){lost=lost||a[i]!=0u;}}if(bits!=0u){lost=lost||(a[words]&((1u<<bits)-1u))!=0u;}return lost;}
fn pf64Aligned128(a:vec4<u32>,shift:i32)->vec4<u32>{if(shift>=0){return pf64ShiftLeft128(a,u32(shift));}let n=u32(-shift);var out=pf64ShiftRight128(a,n);out.x|=u32(pf64Lost128(a,n));return out;}
fn pf64Top128(a:vec4<u32>)->i32{for(var i=3;i>=0;i--){if(a[u32(i)]!=0u){return i*32+31-i32(countLeadingZeros(a[u32(i)]));}}return -1;}
// Result.z=1 requests the unchanged CPU path outside the admitted normal range.
fn positiveFma64(x:vec2<u32>,y:vec2<u32>,z:vec2<u32>)->vec3<u32>{
 let ex=i32((x.y>>20u)&2047u)-1023;let ey=i32((y.y>>20u)&2047u)-1023;let ez=i32((z.y>>20u)&2047u)-1023;
 let zeroX=all(x==vec2<u32>(0u));let zeroY=all(y==vec2<u32>(0u));let zeroZ=all(z==vec2<u32>(0u));
 if(((x.y|y.y|z.y)&2147483648u)!=0u||(!zeroX&&(ex< -400||ex>400))||(!zeroY&&(ey< -400||ey>400))||(!zeroZ&&(ez< -800||ez>800))){return vec3<u32>(0u,0u,1u);}
 if(zeroX||zeroY){return vec3<u32>(z,0u);}
 let mx=vec2<u32>(x.x,(x.y&1048575u)|1048576u);let my=vec2<u32>(y.x,(y.y&1048575u)|1048576u);let mz=vec2<u32>(z.x,select((z.y&1048575u)|1048576u,0u,zeroZ));
 let upper=max(ex+ey+1,select(ez,-2000,zeroZ));let product=pf64Aligned128(pf64Mul53(mx,my),21+ex+ey-upper);let addend=pf64Aligned128(vec4<u32>(mz,0u,0u),73+ez-upper);let sum=pf64Add128(product,addend);let top=pf64Top128(sum);if(top<0){return vec3<u32>(0u);}
 var exponent=upper-125+top;let shift=u32(top-52);let retained=pf64ShiftRight128(sum,shift);var low=retained.x;var high=retained.y;
 let guard=((sum[(shift-1u)>>5u]>>((shift-1u)&31u))&1u)!=0u;let sticky=pf64Lost128(sum,shift-1u);
 if(guard&&(sticky||(low&1u)!=0u)){let next=low+1u;high+=u32(next<low);low=next;}
 if(high>=2097152u){low=(low>>1u)|(high<<31u);high>>=1u;exponent++;}
 if(exponent< -1022||exponent>1023){return vec3<u32>(0u,0u,1u);}
 return vec3<u32>(low,(u32(exponent+1023)<<20u)|(high&1048575u),0u);
}
`;
