#include <wasm_simd128.h>
#include <cstdint>
#include <cstring>
#include <cmath>
static bool fusedEnabled=false;
extern "C" float __real_fmaf(float,float,float);
static float hardware(float a,float b,float c){return wasm_f32x4_extract_lane(wasm_f32x4_relaxed_madd(wasm_f32x4_splat(a),wasm_f32x4_splat(b),wasm_f32x4_splat(c)),0);}
extern "C" float __wrap_fmaf(float a,float b,float c){return fusedEnabled?hardware(a,b,c):__real_fmaf(a,b,c);}
extern "C" int sparse_fma_qualify(){
 fusedEnabled=false;uint32_t seed=0x73684c51;int differences=0;auto next=[&](){seed^=seed<<13;seed^=seed>>17;seed^=seed<<5;return seed;};auto value=[](uint32_t bits){float out;std::memcpy(&out,&bits,4);return out;};
 auto test=[&](float a,float b,float c){const float ref=__real_fmaf(a,b,c),fast=hardware(a,b,c);uint32_t x,y;std::memcpy(&x,&ref,4);std::memcpy(&y,&fast,4);if(x!=y&&!(std::isnan(ref)&&std::isnan(fast)))differences++;};
 for(int i=0;i<4096;i++){const float a=value((next()&0x807fffff)|((107+next()%42)<<23)),b=value((next()&0x807fffff)|((107+next()%42)<<23)),c=value((next()&0x807fffff)|((87+next()%82)<<23));test(a,b,c);test(a,b,-a*b);test(value(next()),value(next()),value(next()));}
 for(int i=0;i<512;i++){test(1.f+i*0x1p-23f,1.5f,0x1p-53f);test(1.f+i*0x1p-23f,1.5f,-0x1p-53f);}
 fusedEnabled=differences==0;return differences;
}
extern "C" int sparse_fma_enabled(){return fusedEnabled;}
