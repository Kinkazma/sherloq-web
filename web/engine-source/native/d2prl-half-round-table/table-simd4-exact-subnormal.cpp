// Internal descriptor layout only: raw Uint16 channel-major input must be
// permuted to pixel-major HWC before this kernel. Trace remains channel-major.
#define D2PRL_FEATURE_AT(c,n,i) ((i)*channels+(c))
// Experimental CPU-reference D2PRL evaluator, not a complete detector.
// Preserve fp16 quantization after each native half operation.
// Build with contraction disabled; every range keeps candidate order intact.
#include <cmath>
#include <cstdint>
#include <cstring>
#include <wasm_simd128.h>
#include <algorithm>
#include <emscripten/emscripten.h>
#include "reference-exp.h"
using H = uint16_t;
// Alternate buffer layouts may tile storage without changing global numerical
// indices (native thread tails and reductions must still see the full image).
#ifndef D2PRL_OFFSET_AT
#define D2PRL_OFFSET_AT(k,n,i) ((k)*(n)+(i))
#endif
#ifndef D2PRL_RESULT_AT
#define D2PRL_RESULT_AT(i) (i)
#endif
inline float fromhalf(H bits) {
 const uint32_t sign=uint32_t(bits&0x8000)<<16;uint32_t e=(bits>>10)&31,m=bits&1023,u;
 if(e==0){if(!m)u=sign;else{int exponent=-14;while(!(m&1024)){m<<=1;exponent--;}u=sign|((exponent+127)<<23)|((m&1023)<<13);}}
 else if(e==31)u=sign|0x7f800000|(m<<13);else u=sign|((e+112)<<23)|(m<<13);
 float x;std::memcpy(&x,&u,4);return x;
}

// Existing table also decodes the exact UInt16 result of half(float).
// Every rounding/half operation stays in its original position and order.
static float descriptor_decode_table[65536];
static bool descriptor_decode_ready=false;
inline void initialize_descriptor_decode_table() {
 if(descriptor_decode_ready)return;
 for(uint32_t bits=0;bits<65536;bits++)descriptor_decode_table[bits]=fromhalf(H(bits));
 descriptor_decode_ready=true;
}
inline float descriptor_fromhalf(H bits) { return descriptor_decode_table[bits]; }
extern "C" EMSCRIPTEN_KEEPALIVE void d2prl_descriptor_decode_initialize() { initialize_descriptor_decode_table(); }
// Raw-bit probe includes NaN signs/payloads without arithmetic. Product inputs
// reject exponent31; finite values, subnormals and both zero signs must match.
extern "C" EMSCRIPTEN_KEEPALIVE int d2prl_descriptor_decode_bits(uint32_t* output,int use_table) {
 if(!output||(use_table!=0&&use_table!=1))return 0;
 initialize_descriptor_decode_table();
 for(uint32_t bits=0;bits<65536;bits++){float value=use_table?descriptor_fromhalf(H(bits)):fromhalf(H(bits));std::memcpy(output+bits,&value,4);}
 return 1;
}

inline v128_t d2prl_neighbor_half4(const H* bits) {
 const v128_t h=wasm_u32x4_extend_low_u16x8(wasm_v128_load64_zero(bits));
 const v128_t exponent=wasm_v128_and(wasm_u32x4_shr(h,10),wasm_i32x4_splat(31));
 const v128_t mantissa=wasm_v128_and(h,wasm_i32x4_splat(1023));
 // Product descriptors reject exponent31. Preserve every infinity/NaN raw
 // payload and sign in the decoder probes by the already proved table path.
 if(wasm_v128_any_true(wasm_i32x4_eq(exponent,wasm_i32x4_splat(31))))
  return wasm_f32x4_make(descriptor_fromhalf(bits[0]),descriptor_fromhalf(bits[1]),descriptor_fromhalf(bits[2]),descriptor_fromhalf(bits[3]));
 const v128_t sign=wasm_i32x4_shl(wasm_v128_and(h,wasm_i32x4_splat(0x8000)),16);
 const v128_t normal=wasm_v128_or(sign,wasm_v128_or(wasm_i32x4_shl(wasm_i32x4_add(exponent,wasm_i32x4_splat(112)),23),wasm_i32x4_shl(mantissa,13)));
 const v128_t zeroExponent=wasm_i32x4_eq(exponent,wasm_i32x4_splat(0));
 const v128_t subnormalMask=wasm_v128_and(zeroExponent,wasm_i32x4_ne(mantissa,wasm_i32x4_splat(0)));
 // Normal/signed-zero quads keep the proven integer-only fast path.
 if(!wasm_v128_any_true(subnormalMask))return wasm_v128_bitselect(sign,normal,zeroExponent);
 // Reinterpret(0x3f000000|m) =0.5 +m*2^-24 for0<=m<=1023.
 // Subtracting0.5 is exact (Sterbenz; representable result). Apply the sign
 // only afterwards with integer OR so both zero signs are retained exactly.
 const v128_t magnitude=wasm_f32x4_sub(wasm_v128_or(wasm_i32x4_splat(0x3f000000),mantissa),wasm_f32x4_splat(0.5f));
 const v128_t signedSubnormal=wasm_v128_or(magnitude,sign);
 return wasm_v128_bitselect(signedSubnormal,normal,zeroExponent);
}
inline float half(float x) {
 uint32_t u;std::memcpy(&u,&x,4);uint16_t sign=(u>>16)&0x8000;uint32_t exponent=(u>>23)&255,m=u&0x7fffff;int e=int(exponent)-112;
 if(exponent==255)return descriptor_fromhalf(sign|0x7c00|(m?512:0));
 if(e>=31)return descriptor_fromhalf(sign|0x7c00);
 if(e<=0){if(e< -10)return descriptor_fromhalf(sign);m|=0x800000;int shift=14-e;uint32_t q=m>>shift,r=m&((1u<<shift)-1),mid=1u<<(shift-1);q+=(r>mid||(r==mid&&(q&1)));return descriptor_fromhalf(sign|q);}
 uint32_t q=(uint32_t(e)<<10)|(m>>13),r=m&8191;q+=(r>4096||(r==4096&&(q&1)));return descriptor_fromhalf(sign|q);
}
extern "C" EMSCRIPTEN_KEEPALIVE float d2prl_softmax_probe(const float* scores,int candidates,float* exponentials,float* weights) {
 if(candidates<1||candidates>13)return NAN;
 initialize_descriptor_decode_table();
 float maximum=-INFINITY;for(int k=0;k<candidates;k++)maximum=std::max(maximum,scores[k]);float denom=0;
 for(int k=0;k<candidates;k++){exponentials[k]=reference_exp(scores[k]-maximum);denom+=exponentials[k];}
 for(int k=0;k<candidates;k++)weights[k]=half(exponentials[k]/denom);
 return denom;
}
extern "C" EMSCRIPTEN_KEEPALIVE int d2prl_softmax_planes(const float* scores,int candidates,int count,float* output) {
 if(candidates<1||candidates>13||count<1)return 0;
 float point[13],exponentials[13],weights[13];
 for(int i=0;i<count;i++){for(int k=0;k<candidates;k++)point[k]=scores[k*count+i];d2prl_softmax_probe(point,candidates,exponentials,weights);for(int k=0;k<candidates;k++)output[k*count+i]=weights[k];}
 return 1;
}
extern "C" EMSCRIPTEN_KEEPALIVE void d2prl_exp_values(const float* input,int count,float* output) {
 for(int i=0;i<count;i++)output[i]=reference_exp(input[i]);
}
extern "C" EMSCRIPTEN_KEEPALIVE int d2prl_evaluate_range(const H* features,const float* ox,const float* oy,int side,int channels,int candidates,int begin,int end,float* result_x,float* result_y,float* trace,int reference_threads) {
 if(side<2||side>448||(channels!=36&&channels!=96)||candidates<1||candidates>13||begin<0||end<begin||end>side*side)return 0;
 if(reference_threads==0)reference_threads=2; // Original offline two-thread probes.
 if(reference_threads<1||reference_threads>32)return 0;
 initialize_descriptor_decode_table();
 int n=side*side,group=channels/3;
 // channels=3*group and 0<=j<group: the original per-channel rotation modulo
 // is exactly this group base plus j. All floating-point operations stay ordered.
 int rotation_bases[9];for(int shift=0;shift<3;shift++)for(int block=0;block<3;block++)rotation_bases[shift*3+block]=((block-shift+3)%3)*group;
 auto log=[&](int field,int at,float value){if(!trace)return;int sizes[]={2*candidates*n,channels*n,channels*n,9*n,n,candidates*n,candidates*n,candidates*n,candidates*n,candidates*n,n,n};int offset=0;for(int j=0;j<field;j++)offset+=sizes[j];trace[offset+at]=value;};
 float original_values[96],values[96],scores[13],expv[13];
 for(int i=begin;i<end;i++) {int x=i%side,y=i/side;float extent=(side-1)*0.5f;
  // Immutable descriptors: decode the original pixel once. Candidate sampling,
  // half rounding, reduction order, trace and global tail indices are unchanged.
  for(int c=0;c<channels;c++)original_values[c]=descriptor_fromhalf(features[D2PRL_FEATURE_AT(c,n,i)]);
  for(int k=0;k<candidates;k++) {int at=k*n+i,source=D2PRL_OFFSET_AT(k,n,i);float gx=half((std::clamp(float(x)+ox[source],0.f,float(side-1))-extent)/extent),gy=half((std::clamp(float(y)+oy[source],0.f,float(side-1))-extent)/extent);log(0,2*at,gx);log(0,2*at+1,gy);
   float px=((gx+1.f)*0.5f)*(side-1),py=((gy+1.f)*0.5f)*(side-1);int x0=int(std::floor(px)),y0=int(std::floor(py)),x1=x0+1,y1=y0+1;
   float nw=(x1-px)*(y1-py),ne=(px-x0)*(y1-py),sw=(x1-px)*(py-y0),se=(px-x0)*(py-y0);
   // Four independent channels; each lane retains the original positive-zero
   // accumulator and NW, NE, SW, SE multiply/add order. No horizontal reduction.
   // Accepted channel counts 36 and96 are both divisible by four.
   for(int c=0;c<channels;c+=4) {
    v128_t s=wasm_f32x4_splat(0.f);
    if(x0>=0&&x0<side&&y0>=0&&y0<side)s=wasm_f32x4_add(s,wasm_f32x4_mul(d2prl_neighbor_half4(features+D2PRL_FEATURE_AT(c,n,y0*side+x0)),wasm_f32x4_splat(nw)));
    if(x1>=0&&x1<side&&y0>=0&&y0<side)s=wasm_f32x4_add(s,wasm_f32x4_mul(d2prl_neighbor_half4(features+D2PRL_FEATURE_AT(c,n,y0*side+x1)),wasm_f32x4_splat(ne)));
    if(x0>=0&&x0<side&&y1>=0&&y1<side)s=wasm_f32x4_add(s,wasm_f32x4_mul(d2prl_neighbor_half4(features+D2PRL_FEATURE_AT(c,n,y1*side+x0)),wasm_f32x4_splat(sw)));
    if(x1>=0&&x1<side&&y1>=0&&y1<side)s=wasm_f32x4_add(s,wasm_f32x4_mul(d2prl_neighbor_half4(features+D2PRL_FEATURE_AT(c,n,y1*side+x1)),wasm_f32x4_splat(se)));
    alignas(16) float sampled[4];wasm_v128_store(sampled,s);
    for(int lane=0;lane<4;lane++){const int channel=c+lane;values[channel]=half(sampled[lane]);if(k==0){log(1,channel*n+i,values[channel]);log(2,channel*n+i,-std::abs(half(original_values[channel]-values[channel])));}}
   }
   float best=-INFINITY;
   for(int shift=0;shift<3;shift++)for(int block=0;block<3;block++){float sum=0;const int other_base=rotation_bases[shift*3+block];
    for(int j=0;j<group;j++){int c=block*group+j,other=other_base+j;sum+=-std::abs(half(original_values[c]-values[other]));}
    float m=half(sum/group);if(k==0)log(3,(shift*3+block)*n+i,m);best=std::max(best,m);
   }
   if(k==0)log(4,i,best);log(5,at,best);scores[k]=half(best*1000.f);log(6,at,scores[k]);
  }
  float weights[13];
  // Preserve the reference CPU kernel's scalar remainder at each thread chunk.
  // This parameter describes numerical reference layout, not browser workers.
  const int chunk=(n+reference_threads-1)/reference_threads,start=(i/chunk)*chunk,length=std::min(chunk,n-start);
  if(i-start>=length/8*8){float maximum=-INFINITY,denom=0;for(int k=0;k<candidates;k++)maximum=std::max(maximum,scores[k]);for(int k=0;k<candidates;k++){const float e=std::exp(scores[k]-maximum);denom+=e;expv[k]=half(e);}for(int k=0;k<candidates;k++)weights[k]=half(expv[k]/denom);}
  else d2prl_softmax_probe(scores,candidates,expv,weights);
  float xsum=0,ysum=0,wxv[13],wyv[13];
  // The native non-last-dimension softmax divides each float32 exponential.
  // Multiplication by a rounded reciprocal can cross a half rounding boundary.
  for(int k=0;k<candidates;k++){int at=k*n+i,source=D2PRL_OFFSET_AT(k,n,i);float weight=weights[k];float wx=ox[source]*weight,wy=oy[source]*weight;log(7,at,weight);log(8,at,wx);log(9,at,wy);wxv[k]=wx;wyv[k]=wy;}
  if(i>=n/16*16){float sx[4]={},sy[4]={};const int grouped=candidates/4*4;for(int k=0;k<grouped;k++){sx[k%4]+=wxv[k];sy[k%4]+=wyv[k];}for(int k=grouped;k<candidates;k++){sx[0]+=wxv[k];sy[0]+=wyv[k];}xsum=((sx[0]+sx[1])+sx[2])+sx[3];ysum=((sy[0]+sy[1])+sy[2])+sy[3];}
  else for(int k=0;k<candidates;k++){xsum+=wxv[k];ysum+=wyv[k];}
  log(10,i,xsum);log(11,i,ysum);result_x[D2PRL_RESULT_AT(i)]=std::clamp(xsum+x,0.f,float(side-1))-x;result_y[D2PRL_RESULT_AT(i)]=std::clamp(ysum+y,0.f,float(side-1))-y;
 }
 return 1;
}

extern "C" EMSCRIPTEN_KEEPALIVE int d2prl_descriptor_layout() { return 1; }

// Test-only SIMD decoder bits, including misaligned inputs and scalar tails.
extern "C" EMSCRIPTEN_KEEPALIVE void d2prl_bilinear_decode4(const H* bits,int count,float* output) {
 initialize_descriptor_decode_table();
 int i=0;for(;i+4<=count;i+=4)wasm_v128_store(output+i,d2prl_neighbor_half4(bits+i));
 for(;i<count;i++)output[i]=descriptor_fromhalf(bits[i]);
}
