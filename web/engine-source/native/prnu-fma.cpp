// Same guarded exact binary64 expansion as comparison-fma.h, extended to two
// independent vector multipliers. Strict operations: compile ff-contract=off.
#include <initializer_list>
#define cv_comparison_fma_test cv_prnu_scalar_test
#include "comparison-fma.h"
#undef cv_comparison_fma_test
#include <wasm_simd128.h>
using PrnuPair=double __attribute__((vector_size(16)));
static bool prnuFastFma=false;
extern "C" void cv_prnu_fma_mode(int fast){prnuFastFma=fast!=0;}
extern "C" double sherloq_prnu_fma64(double x,double y,double z){return prnuFastFma?comparisonFmaFast(x,y,z):std::fma(x,y,z);}
static inline v128_t sumError(v128_t a,v128_t b,v128_t sum){const auto v=wasm_f64x2_sub(sum,a);return wasm_f64x2_add(wasm_f64x2_sub(a,wasm_f64x2_sub(sum,v)),wasm_f64x2_sub(b,v));}
static v128_t fmaPair(v128_t x,v128_t y,v128_t z){
 const auto zero=wasm_f64x2_splat(0),one=wasm_i64x2_splat(0),fractionMask=wasm_i64x2_splat(0xfffffffffffffULL);
 const auto ax=wasm_f64x2_abs(x),ay=wasm_f64x2_abs(y),az=wasm_f64x2_abs(z);
 auto bound=[&](v128_t a,double low,double high){return wasm_v128_or(wasm_f64x2_eq(a,zero),wasm_v128_and(wasm_f64x2_ge(a,wasm_f64x2_splat(low)),wasm_f64x2_le(a,wasm_f64x2_splat(high))));};
 auto valid=wasm_v128_and(wasm_v128_and(bound(ax,0x1p-200,0x1p200),bound(ay,0x1p-200,0x1p200)),bound(az,0x1p-400,0x1p400));
 const auto p=wasm_f64x2_mul(x,y),s=wasm_f64x2_add(p,z),split=wasm_f64x2_splat(0x1.0000002p27);
 const auto cx=wasm_f64x2_mul(split,x),cy=wasm_f64x2_mul(split,y),xh=wasm_f64x2_sub(cx,wasm_f64x2_sub(cx,x)),yh=wasm_f64x2_sub(cy,wasm_f64x2_sub(cy,y)),xl=wasm_f64x2_sub(x,xh),yl=wasm_f64x2_sub(y,yh);
 const auto pe=wasm_f64x2_add(wasm_f64x2_add(wasm_f64x2_add(wasm_f64x2_sub(wasm_f64x2_mul(xh,yh),p),wasm_f64x2_mul(xh,yl)),wasm_f64x2_mul(xl,yh)),wasm_f64x2_mul(xl,yl));
 const auto se=sumError(p,z,s),t=wasm_f64x2_add(pe,se),te=sumError(pe,se,t);auto r=wasm_f64x2_add(s,t);const auto re=sumError(s,t,r);
 const auto fraction=wasm_v128_and(r,fractionMask),power=wasm_i64x2_eq(fraction,one);
 auto half=wasm_i64x2_sub(wasm_v128_and(r,wasm_i64x2_splat(0x7ff0000000000000ULL)),wasm_i64x2_splat(uint64_t(53)<<52));half=wasm_i64x2_sub(half,wasm_v128_and(power,wasm_i64x2_splat(1ULL<<52)));
 const auto ar=wasm_f64x2_abs(r),gap=wasm_f64x2_sub(half,wasm_f64x2_abs(re));
 auto rounded=wasm_v128_and(wasm_v128_and(wasm_f64x2_ge(ar,wasm_f64x2_splat(0x1p-600)),wasm_f64x2_le(ar,wasm_f64x2_splat(0x1p600))),wasm_f64x2_lt(wasm_f64x2_mul(wasm_f64x2_splat(2),wasm_f64x2_abs(te)),gap));
 const auto exactProduct=wasm_v128_or(wasm_v128_or(wasm_f64x2_eq(ax,zero),wasm_f64x2_eq(ay,zero)),wasm_v128_or(wasm_i64x2_eq(wasm_v128_and(x,fractionMask),one),wasm_i64x2_eq(wasm_v128_and(y,fractionMask),one)));
 valid=wasm_v128_and(valid,wasm_v128_or(exactProduct,rounded));r=wasm_v128_bitselect(s,r,exactProduct);
 const int mask=wasm_i64x2_bitmask(valid);
 if(!(mask&1))r=wasm_f64x2_replace_lane(r,0,std::fma(wasm_f64x2_extract_lane(x,0),wasm_f64x2_extract_lane(y,0),wasm_f64x2_extract_lane(z,0)));
 if(!(mask&2))r=wasm_f64x2_replace_lane(r,1,std::fma(wasm_f64x2_extract_lane(x,1),wasm_f64x2_extract_lane(y,1),wasm_f64x2_extract_lane(z,1)));
 return r;
}
extern "C" PrnuPair sherloq_prnu_fma2(PrnuPair x,PrnuPair y,PrnuPair z){
 if(prnuFastFma)return (PrnuPair)fmaPair((v128_t)x,(v128_t)y,(v128_t)z);
 return PrnuPair{std::fma(x[0],y[0],z[0]),std::fma(x[1],y[1],z[1])};
}
extern "C" int cv_prnu_vector_test(uint32_t seed,int count){
 int mismatches=0;auto next=[&](){seed^=seed<<13;seed^=seed>>17;seed^=seed<<5;return seed;};
 auto number=[&](bool bounded){uint64_t bits=uint64_t(next())<<32;bits|=next();if(bounded)bits=(bits&0x800fffffffffffffULL)|(uint64_t(823+next()%401)<<52);double x;std::memcpy(&x,&bits,8);return x;};
 auto check=[&](PrnuPair x,PrnuPair y,PrnuPair z){const auto r=(PrnuPair)fmaPair((v128_t)x,(v128_t)y,(v128_t)z);for(int i=0;i<2;i++){double expected=std::fma(x[i],y[i],z[i]),actual=r[i];uint64_t a,b;std::memcpy(&a,&expected,8);std::memcpy(&b,&actual,8);if(!(std::isnan(actual)&&std::isnan(expected))&&a!=b)mismatches++;}};
 for(int i=0;i<count;i++){PrnuPair x{number(i%2),number(i%2)},y{number(i%2),number(i%2)},z{number(i%2),number(i%2)};check(x,y,z);check(x,y,PrnuPair{-(x[0]*y[0]),std::nextafter(-(x[1]*y[1]),INFINITY)});}
 const double values[]={0.,-0.,0x1p-1074,-0x1p-1074,0x1p-1022,-0x1p-1022,0x1p-400,0x1p-200,0x1p200,0x1p400,0x1.fffffffffffffp1023,1.,-1.,0x1.0000000000001p0,0x1.fffffffffffffp-1,0x1p-53,-0x1p-53,INFINITY,-INFINITY,NAN};
 for(double x:values)for(double y:values)for(double z:values)check(PrnuPair{x,-x},PrnuPair{y,-y},PrnuPair{z,-z});
 for(int i=0;i<4096;i++){double x=1.+i*0x1p-52;check(PrnuPair{x,-x},PrnuPair{1.5,1.5},PrnuPair{0x1p-110,-0x1p-110});check(PrnuPair{x,-x},PrnuPair{1.5,1.5},PrnuPair{-0x1p-110,0x1p-110});}
 return mismatches;
}
