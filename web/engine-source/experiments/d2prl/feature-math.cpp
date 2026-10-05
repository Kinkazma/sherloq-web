// Experimental composition helpers. The native reference uses distinct float32
// multiplications/additions before sqrt, and round-to-nearest-even float16.
#include "resize.cpp"
#include <cstdint>
#include <cstring>

extern "C" int d2prl_reflect(const float* input, int channels, int h, int w, int pad, float* output) {
 if(channels<1||channels>512||h<=pad||w<=pad||h>1024||w>1024||pad<0||pad>7)return 0;
 const int oh=h+2*pad,ow=w+2*pad;
 for(int c=0;c<channels;c++)for(int y=0;y<oh;y++)for(int x=0;x<ow;x++){
  int yy=y-pad,xx=x-pad;yy=yy<0?-yy:yy>=h?2*h-yy-2:yy;xx=xx<0?-xx:xx>=w?2*w-xx-2:xx;
  output[(c*oh+y)*ow+x]=input[(c*h+yy)*w+xx];
 }return 1;
}
extern "C" int d2prl_magnitude(const float* real, const float* imag, int count, float* output) {
 if(count<1)return 0;
 for(int i=0;i<count;i++){const float r=real[i]*real[i],m=imag[i]*imag[i],s=r+m,t=s+1e-10f;output[i]=std::sqrt(t);}return 1;
}
extern "C" int d2prl_half_bits(const float* input, int count, uint16_t* output) {
 if(count<1)return 0;
 for(int i=0;i<count;i++){
  uint32_t u;std::memcpy(&u,input+i,4);const uint16_t sign=(u>>16)&0x8000;
  const uint32_t exponent=(u>>23)&255;uint32_t m=u&0x7fffff;const int e=int(exponent)-112;
  if(exponent==255){output[i]=sign|0x7c00|(m?512:0);continue;}
  if(e>=31){output[i]=sign|0x7c00;continue;}
  if(e<=0){if(e< -10){output[i]=sign;continue;}m|=0x800000;const int shift=14-e;uint32_t q=m>>shift,r=m&((1u<<shift)-1),mid=1u<<(shift-1);q+=(r>mid||(r==mid&&(q&1)));output[i]=sign|q;continue;}
  uint32_t q=(uint32_t(e)<<10)|(m>>13),r=m&8191;q+=(r>4096||(r==4096&&(q&1)));output[i]=sign|q;
 }return 1;
}
