// Exact binary32 FMA shortcut, shared mathematical guard with stereo-fma.h.
// A binary32 product is exact in binary64. Double rounding can affect a
// subsequent binary32 result only at a binary32 midpoint. Those cases,
// subnormal results and nonfinite arithmetic retain software std::fma.
// Offline candidate: no runtime calibration or test loop is called by a job.
#include <cmath>
#include <cfloat>
#include <cstdint>
#include <cstring>
#include <initializer_list>
static bool fast=true;
extern "C" void cloning_fma_mode(int enabled){fast=enabled!=0;}
extern "C" float cloning_fma32(float x,float y,float z){
    if(!fast)return std::fma(x,y,z);
    const double sum=double(x)*double(y)+double(z);
    uint64_t bits;std::memcpy(&bits,&sum,8);
    if(!std::isfinite(sum)||(bits&0x1fffffff)==0x10000000||(sum!=0&&std::abs(sum)<FLT_MIN))return std::fma(x,y,z);
    return float(sum);
}
extern "C" int cloning_fma_test(uint32_t seed,int count){
    int mismatches=0;
    auto next=[&](){seed^=seed<<13;seed^=seed>>17;seed^=seed<<5;float x;std::memcpy(&x,&seed,4);return x;};
    auto check=[&](float x,float y,float z){const float a=cloning_fma32(x,y,z),b=std::fma(x,y,z);uint32_t ab,bb;std::memcpy(&ab,&a,4);std::memcpy(&bb,&b,4);if(!(std::isnan(a)&&std::isnan(b))&&ab!=bb)mismatches++;};
    for(int i=0;i<count;i++){const float x=next(),y=next(),z=next();check(x,y,z);check(x,y,-(x*y));}
    const float special[]={0.f,-0.f,FLT_MIN,-FLT_MIN,FLT_MAX,-FLT_MAX,0x1p-149f,-0x1p-149f,1.f,-1.f,0x1.000002p0f,0x1.fffffep-1f,0x1p-24f,-0x1p-24f,INFINITY,-INFINITY,NAN};
    for(float x:special)for(float y:special)for(float z:special)check(x,y,z);
    for(int i=0;i<4096;i++){const float x=1.f+i*0x1p-23f;for(float sign:{-1.f,1.f})for(float z:{0x1p-60f,-0x1p-60f})check(sign*x,1.5f,z);}
    return mismatches;
}
