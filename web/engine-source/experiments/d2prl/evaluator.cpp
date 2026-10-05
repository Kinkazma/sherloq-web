// Experimental CPU-reference D2PRL evaluator, not a complete detector.
// Preserve fp16 quantization after each native half operation.
// Build with contraction disabled; every range keeps candidate order intact.
#include <cmath>
#include <cstdint>
#include <cstring>
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
inline float half(float x) {
 uint32_t u;std::memcpy(&u,&x,4);uint16_t sign=(u>>16)&0x8000;uint32_t exponent=(u>>23)&255,m=u&0x7fffff;int e=int(exponent)-112;
 if(exponent==255)return fromhalf(sign|0x7c00|(m?512:0));
 if(e>=31)return fromhalf(sign|0x7c00);
 if(e<=0){if(e< -10)return fromhalf(sign);m|=0x800000;int shift=14-e;uint32_t q=m>>shift,r=m&((1u<<shift)-1),mid=1u<<(shift-1);q+=(r>mid||(r==mid&&(q&1)));return fromhalf(sign|q);}
 uint32_t q=(uint32_t(e)<<10)|(m>>13),r=m&8191;q+=(r>4096||(r==4096&&(q&1)));return fromhalf(sign|q);
}
extern "C" EMSCRIPTEN_KEEPALIVE float d2prl_softmax_probe(const float* scores,int candidates,float* exponentials,float* weights) {
 if(candidates<1||candidates>13)return NAN;
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
 int n=side*side,group=channels/3;
 auto log=[&](int field,int at,float value){if(!trace)return;int sizes[]={2*candidates*n,channels*n,channels*n,9*n,n,candidates*n,candidates*n,candidates*n,candidates*n,candidates*n,n,n};int offset=0;for(int j=0;j<field;j++)offset+=sizes[j];trace[offset+at]=value;};
 float values[96],scores[13],expv[13];
 for(int i=begin;i<end;i++) {int x=i%side,y=i/side;float extent=(side-1)*0.5f;
  for(int k=0;k<candidates;k++) {int at=k*n+i,source=D2PRL_OFFSET_AT(k,n,i);float gx=half((std::clamp(float(x)+ox[source],0.f,float(side-1))-extent)/extent),gy=half((std::clamp(float(y)+oy[source],0.f,float(side-1))-extent)/extent);log(0,2*at,gx);log(0,2*at+1,gy);
   float px=((gx+1.f)*0.5f)*(side-1),py=((gy+1.f)*0.5f)*(side-1);int x0=int(std::floor(px)),y0=int(std::floor(py)),x1=x0+1,y1=y0+1;
   float nw=(x1-px)*(y1-py),ne=(px-x0)*(y1-py),sw=(x1-px)*(py-y0),se=(px-x0)*(py-y0);
   for(int c=0;c<channels;c++) {const H* plane=features+c*n;float s=0;
    if(x0>=0&&x0<side&&y0>=0&&y0<side)s+=fromhalf(plane[y0*side+x0])*nw;
    if(x1>=0&&x1<side&&y0>=0&&y0<side)s+=fromhalf(plane[y0*side+x1])*ne;
    if(x0>=0&&x0<side&&y1>=0&&y1<side)s+=fromhalf(plane[y1*side+x0])*sw;
    if(x1>=0&&x1<side&&y1>=0&&y1<side)s+=fromhalf(plane[y1*side+x1])*se;
    values[c]=half(s);if(k==0){log(1,c*n+i,values[c]);log(2,c*n+i,-std::abs(half(fromhalf(plane[i])-values[c])));}
   }
   float best=-INFINITY;
   for(int shift=0;shift<3;shift++)for(int block=0;block<3;block++){float sum=0;
    for(int j=0;j<group;j++){int c=block*group+j,other=(c-shift*group+channels)%channels;sum+=-std::abs(half(fromhalf(features[c*n+i])-values[other]));}
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
