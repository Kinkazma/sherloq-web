// IEEE binary32 product is exact in binary64. A final binary32 rounding can
// differ from fused arithmetic only when the rounded binary64 sum lies exactly
// on a binary32 midpoint. Use software FMA there and for underflow/nonfinite.
// Unlike the frequency-mask shortcut, this accepts negative operands/results.
static bool stereoFastArithmetic=true;
static inline float stereoFastFmaValue(float x,float y,float z){
 double sum=double(x)*double(y)+double(z);uint64_t bits;std::memcpy(&bits,&sum,8);
 if(!std::isfinite(sum)||(bits&0x1fffffff)==0x10000000||(sum!=0&&std::abs(sum)<FLT_MIN))return std::fma(x,y,z);
 return float(sum);
}
extern "C" float sherloq_stereo_fma(float x,float y,float z){return stereoFastArithmetic?stereoFastFmaValue(x,y,z):std::fma(x,y,z);}
extern "C" double sherloq_stereo_fma64(double x,double y,double z){
 // Farneback widens many binary32 factors before a binary64 accumulation.
 // Their product is exact in binary64, so ordinary addition is already fused.
 if(stereoFastArithmetic&&std::isfinite(x)&&std::isfinite(y)&&double(float(x))==x&&double(float(y))==y)return x*y+z;
 return std::fma(x,y,z);
}
extern "C" int cv_stereo_fma_test(uint32_t seed,int count){
 int mismatches=0;auto next=[&](){seed^=seed<<13;seed^=seed>>17;seed^=seed<<5;float x;std::memcpy(&x,&seed,4);return x;};
 auto check=[&](float x,float y,float z){float a=stereoFastFmaValue(x,y,z),b=std::fma(x,y,z);uint32_t ab,bb;std::memcpy(&ab,&a,4);std::memcpy(&bb,&b,4);if(!(std::isnan(a)&&std::isnan(b))&&ab!=bb)mismatches++;};
 for(int i=0;i<count;i++){float x=next(),y=next(),z=next();check(x,y,z);double dz=double(z)*.123456789,a=sherloq_stereo_fma64(x,y,dz),b=std::fma(double(x),double(y),dz);uint64_t ab,bb;std::memcpy(&ab,&a,8);std::memcpy(&bb,&b,8);if(!(std::isnan(a)&&std::isnan(b))&&ab!=bb)mismatches++;}
 const float special[]={0.f,-0.f,FLT_MIN,-FLT_MIN,FLT_MAX,-FLT_MAX,0x1p-149f,-0x1p-149f,1.f,-1.f,0x1.000002p0f,0x1.fffffep-1f,0x1p-24f,-0x1p-24f,INFINITY,-INFINITY,NAN};
 for(float x:special)for(float y:special)for(float z:special)check(x,y,z);
 // Deliberately create double-rounding traps on either side of a midpoint.
 for(int i=0;i<4096;i++){float x=1.f+i*0x1p-23f;for(float sign:{-1.f,1.f})for(float z:{0x1p-60f,-0x1p-60f})check(sign*x,0x1.8p0f,z);}
 return mismatches;
}
