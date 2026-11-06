// SIMD lanes are independent output pixels: reduction order within each pixel
// remains exactly the scalar SciPy order. No relaxed-SIMD FMA is used.
#include <wasm_simd128.h>
#define COMPARISON_SIMD __attribute__((target("simd128")))
static bool comparisonContiguous=true;
static COMPARISON_SIMD inline v128_t comparisonSumError2(v128_t a,v128_t b,v128_t s){
 auto v=wasm_f64x2_sub(s,a);
 return wasm_f64x2_add(wasm_f64x2_sub(a,wasm_f64x2_sub(s,v)),wasm_f64x2_sub(b,v));
}
struct ComparisonFactor{
 double value,hi,lo;bool bounded,power;
 explicit ComparisonFactor(double y):value(y){
  bounded=std::abs(y)>=0x1p-200&&std::abs(y)<=0x1p200;
  uint64_t bits;std::memcpy(&bits,&y,8);power=(bits&0xfffffffffffffULL)==0;
  double c=0x1.0000002p27*y;hi=c-(c-y);lo=y-hi;
 }
};
static COMPARISON_SIMD inline v128_t comparisonFma2(v128_t x,const ComparisonFactor& factor,v128_t z){
 const double y=factor.value;
 if(!comparisonFastArithmetic||!factor.bounded)return wasm_f64x2_make(std::fma(wasm_f64x2_extract_lane(x,0),y,wasm_f64x2_extract_lane(z,0)),std::fma(wasm_f64x2_extract_lane(x,1),y,wasm_f64x2_extract_lane(z,1)));
 const auto zero=wasm_f64x2_splat(0),p=wasm_f64x2_mul(x,wasm_f64x2_splat(y)),s=wasm_f64x2_add(p,z),ax=wasm_f64x2_abs(x),az=wasm_f64x2_abs(z);
 const auto xzero=wasm_f64x2_eq(ax,zero);
 auto valid=wasm_v128_and(wasm_v128_or(xzero,wasm_v128_and(wasm_f64x2_ge(ax,wasm_f64x2_splat(0x1p-200)),wasm_f64x2_le(ax,wasm_f64x2_splat(0x1p200)))),wasm_v128_or(wasm_f64x2_eq(az,zero),wasm_v128_and(wasm_f64x2_ge(az,wasm_f64x2_splat(0x1p-400)),wasm_f64x2_le(az,wasm_f64x2_splat(0x1p400)))));
 v128_t r=s;
 if(!factor.power){
  const auto cx=wasm_f64x2_mul(wasm_f64x2_splat(0x1.0000002p27),x),xh=wasm_f64x2_sub(cx,wasm_f64x2_sub(cx,x)),xl=wasm_f64x2_sub(x,xh),yh=wasm_f64x2_splat(factor.hi),yl=wasm_f64x2_splat(factor.lo);
  auto pe=wasm_f64x2_add(wasm_f64x2_add(wasm_f64x2_add(wasm_f64x2_sub(wasm_f64x2_mul(xh,yh),p),wasm_f64x2_mul(xh,yl)),wasm_f64x2_mul(xl,yh)),wasm_f64x2_mul(xl,yl));
  const auto se=comparisonSumError2(p,z,s),t=wasm_f64x2_add(pe,se),te=comparisonSumError2(pe,se,t);r=wasm_f64x2_add(s,t);
  const auto re=comparisonSumError2(s,t,r),fraction=wasm_v128_and(r,wasm_i64x2_splat(0xfffffffffffffULL)),power=wasm_i64x2_eq(fraction,wasm_i64x2_splat(0));
  auto half=wasm_i64x2_sub(wasm_v128_and(r,wasm_i64x2_splat(0x7ff0000000000000ULL)),wasm_i64x2_splat(uint64_t(53)<<52));half=wasm_i64x2_sub(half,wasm_v128_and(power,wasm_i64x2_splat(1ULL<<52)));
  const auto ar=wasm_f64x2_abs(r),gap=wasm_f64x2_sub(half,wasm_f64x2_abs(re));
  auto rounded=wasm_v128_and(wasm_v128_and(wasm_f64x2_ge(ar,wasm_f64x2_splat(0x1p-600)),wasm_f64x2_le(ar,wasm_f64x2_splat(0x1p600))),wasm_f64x2_lt(wasm_f64x2_mul(wasm_f64x2_splat(2),wasm_f64x2_abs(te)),gap));
  valid=wasm_v128_and(valid,wasm_v128_or(xzero,rounded));r=wasm_v128_bitselect(s,r,xzero);
 }
 const int mask=wasm_i64x2_bitmask(valid);
 if(!(mask&1))r=wasm_f64x2_replace_lane(r,0,std::fma(wasm_f64x2_extract_lane(x,0),y,wasm_f64x2_extract_lane(z,0)));
 if(!(mask&2))r=wasm_f64x2_replace_lane(r,1,std::fma(wasm_f64x2_extract_lane(x,1),y,wasm_f64x2_extract_lane(z,1)));
 return r;
}
static COMPARISON_SIMD void comparisonConvolveRows(const cv::Mat& input,const cv::Mat& weights,cv::Mat& out){
 std::vector<ComparisonFactor> factors;for(int ky=0;ky<weights.rows;ky++)for(int k=0;k<weights.cols;k++)factors.emplace_back(weights.at<double>(ky,k));
 out.setTo(0.);
 for(int y=0;y<out.rows;y++){
  double* dst=out.ptr<double>(y);
  for(int ky=0;ky<weights.rows;ky++){
   const double* src=input.ptr<double>(y+weights.rows-1-ky)+weights.cols-1;const double* w=weights.ptr<double>(ky);const auto* factor=factors.data()+ky*weights.cols;int k=0;
   for(;k<=weights.cols-4;k+=4){
    int x=0;for(;x+1<out.cols;x+=2){auto group=wasm_f64x2_mul(wasm_v128_load(src+x-k),wasm_f64x2_splat(w[k]));for(int j=1;j<4;j++)group=comparisonFma2(wasm_v128_load(src+x-k-j),factor[k+j],group);wasm_v128_store(dst+x,wasm_f64x2_add(wasm_v128_load(dst+x),group));}
    for(;x<out.cols;x++){double group=w[k]*src[x-k];for(int j=1;j<4;j++)group=comparisonFma(src[x-k-j],w[k+j],group);dst[x]+=group;}
   }
   for(;k<weights.cols;k++){
    int x=0;for(;x+1<out.cols;x+=2)wasm_v128_store(dst+x,comparisonFma2(wasm_v128_load(src+x-k),factor[k],wasm_v128_load(dst+x)));
    for(;x<out.cols;x++)dst[x]=comparisonFma(src[x-k],w[k],dst[x]);
   }
  }
 }
}
extern "C" COMPARISON_SIMD int cv_comparison_simd_test(uint32_t seed,int count){
 int mismatches=0;auto next=[&](){seed^=seed<<13;seed^=seed>>17;seed^=seed<<5;return seed;};
 auto value=[&](bool bounded){uint64_t bits=uint64_t(next())<<32;bits|=next();if(bounded)bits=(bits&0x800fffffffffffffULL)|(uint64_t(823+next()%401)<<52);double v;std::memcpy(&v,&bits,8);return v;};
 auto check=[&](double a,double b,double y,double za,double zb) COMPARISON_SIMD {const auto actual=comparisonFma2(wasm_f64x2_make(a,b),ComparisonFactor(y),wasm_f64x2_make(za,zb));const double x[]={a,b},z[]={za,zb},r[]={wasm_f64x2_extract_lane(actual,0),wasm_f64x2_extract_lane(actual,1)};for(int i=0;i<2;i++){double expected=std::fma(x[i],y,z[i]);uint64_t ab,bb;std::memcpy(&ab,&r[i],8);std::memcpy(&bb,&expected,8);if(!(std::isnan(r[i])&&std::isnan(expected))&&ab!=bb)mismatches++;}};
 comparisonFastArithmetic=true;
 for(int i=0;i<count;i++){double a=value(i%2),b=value(i%2),y=value(i%2),za=value(i%2),zb=value(i%2);check(a,b,y,za,zb);check(a,b,y,-(a*y),std::nextafter(-(b*y),INFINITY));}
 const double special[]={0.,-0.,0x1p-1074,-0x1p-1074,0x1p-1022,-0x1p-1022,0x1p-400,0x1p-200,0x1p200,0x1p400,0x1.fffffffffffffp1023,1.,-1.,0x1.0000000000001p0,0x1.fffffffffffffp-1,0x1p-53,-0x1p-53,INFINITY,-INFINITY,NAN};
 for(double x:special)for(double y:special)for(double z:special)check(x,-x,y,z,-z);
 for(int i=0;i<4096;i++){double x=1.+i*0x1p-52;check(x,-x,1.5,0x1p-110,-0x1p-110);check(x,-x,1.5,-0x1p-110,0x1p-110);}
 return mismatches;
}
#undef COMPARISON_SIMD
