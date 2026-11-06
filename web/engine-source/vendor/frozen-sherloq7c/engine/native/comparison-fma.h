// Restricted, guarded binary64 FMA. See docs/COMPARISON-ARITHMETIC.md.
// Compile with round-to-nearest, no reassociation and -ffp-contract=off.
#include <cmath>
#include <cstdint>
#include <cstring>
static bool comparisonFastArithmetic=true;
static inline double comparisonSumError(double a,double b,double sum){
 const double virtualB=sum-a;
 return (a-(sum-virtualB))+(b-virtualB);
}
static inline double comparisonFmaFast(double x,double y,double z){
 const double ax=std::abs(x),ay=std::abs(y),az=std::abs(z);
 // These bounds keep the split, product residual and every sum well inside
 // the normal range; all other inputs go through the complete IEEE routine.
 if(!(ax>=0x1p-200&&ax<=0x1p200&&ay>=0x1p-200&&ay<=0x1p200&&
      (az==0||(az>=0x1p-400&&az<=0x1p400))))return std::fma(x,y,z);
 const double p=x*y;
 uint64_t xb,yb;std::memcpy(&xb,&x,8);std::memcpy(&yb,&y,8);
 // A bounded power-of-two scaling is exact, hence only the addition rounds.
 if((xb&0xfffffffffffffULL)==0||(yb&0xfffffffffffffULL)==0)return p+z;
 const double cx=0x1.0000002p27*x,cy=0x1.0000002p27*y;
 const double xh=cx-(cx-x),xl=x-xh,yh=cy-(cy-y),yl=y-yh;
 const double pe=((xh*yh-p)+xh*yl+xl*yh)+xl*yl;
 const double s=p+z,se=comparisonSumError(p,z,s);
 const double t=pe+se,te=comparisonSumError(pe,se,t);
 const double r=s+t,re=comparisonSumError(s,t,r);
 uint64_t bits;std::memcpy(&bits,&r,8);const int exponent=int((bits>>52)&2047);
 if(exponent<423||exponent>1623)return std::fma(x,y,z);
 // Distance to the closer midpoint. At a power of two the lower binade
 // has half the spacing. This is conservative for either residual sign.
 const int halfExponent=exponent-53-((bits&0xfffffffffffffULL)==0);
 uint64_t halfBits=uint64_t(halfExponent)<<52;double half;std::memcpy(&half,&halfBits,8);
 const double gap=half-std::abs(re);
 // x*y+z = r+re+te exactly. For |re| >= half/2, subtraction is exact
 // (Sterbenz); otherwise gap >= half/2. The factor two is conservative
 // even in that latter rounded subtraction. Strictness rejects all ties.
 if(2*std::abs(te)<gap)return r;
 return std::fma(x,y,z);
}
static inline double comparisonFma(double x,double y,double z){
 return comparisonFastArithmetic?comparisonFmaFast(x,y,z):std::fma(x,y,z);
}
extern "C" int cv_comparison_fma_test(uint32_t seed,int count){
 int mismatches=0;auto next=[&](){seed^=seed<<13;seed^=seed>>17;seed^=seed<<5;return seed;};
 auto fromBits=[](uint64_t bits){double value;std::memcpy(&value,&bits,8);return value;};
 auto check=[&](double x,double y,double z){double a=comparisonFmaFast(x,y,z),b=std::fma(x,y,z);uint64_t ab,bb;std::memcpy(&ab,&a,8);std::memcpy(&bb,&b,8);if(!(std::isnan(a)&&std::isnan(b))&&ab!=bb)mismatches++;};
 auto arbitrary=[&](){uint64_t hi=next(),lo=next();return fromBits((hi<<32)|lo);};
 auto bounded=[&](int low,int span){uint64_t bits=uint64_t(next())<<32;bits|=next();bits=(bits&0x800fffffffffffffULL)|(uint64_t(low+next()%span)<<52);return fromBits(bits);};
 for(int i=0;i<count;i++){
  double x=arbitrary(),y=arbitrary(),z=arbitrary();check(x,y,z);
  x=bounded(823,401);y=bounded(823,401);z=bounded(623,801);check(x,y,z);
  check(x,y,-(x*y));check(x,y,std::nextafter(-(x*y),INFINITY));
  x=bounded(1000,40);y=bounded(1000,40);z=bounded(1000,40);check(x,y,z);
 }
 const double special[]={0.,-0.,0x1p-1074,-0x1p-1074,0x1p-1022,-0x1p-1022,0x1p-400,0x1p-200,0x1p200,0x1p400,0x1.fffffffffffffp1023,1.,-1.,0x1.0000000000001p0,0x1.fffffffffffffp-1,0x1p-53,-0x1p-53,INFINITY,-INFINITY,NAN};
 for(double x:special)for(double y:special)for(double z:special)check(x,y,z);
 for(int i=0;i<4096;i++)for(double sign:{-1.,1.})for(double z:{0x1p-110,-0x1p-110})check(sign*(1.+i*0x1p-52),1.5,z);
 return mismatches;
}
