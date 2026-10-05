// M4 binary64 compatibility arithmetic for EM: exp(nonpositive), pow(residual,2).
// FMA and split reductions are mandatory; see NUMERICAL-DATA.json.
#include <cmath>
#include <cstdint>
#include <cstring>
#include "math-tables.h"
static uint64_t bits(double x){uint64_t b;std::memcpy(&b,&x,8);return b;}
static double number(uint64_t b){double x;std::memcpy(&x,&b,8);return x;}
extern "C" double em_exp(double x){
 if(x<-745.25)return 0.;if(!std::isfinite(x)||x>709.7827128933841)return std::exp(x);
 const auto*c=exp_coeff;double z=x*c[0];int64_t n=std::floor(z);double r=z-double(n),err=std::fma(-x,c[0],z),tail=std::fma(x,c[1],-err);int i=int(n)&127;double a=exp_table[2*i],b=exp_table[2*i+1];double p=r+c[2],q=r+c[3];b+=tail;r+=b;p=std::fma(r,p,c[4]);q=std::fma(r,q,c[5]);r*=c[6];r*=p;r*=q;int k=n>>7;
 if(k>=-1022)return number(bits(std::fma(r,a,a))+(uint64_t(int64_t(k))<<52));
 a=number(bits(a)+(uint64_t(int64_t(k+1022))<<52));double hi=a+1.,lo=a-(hi-1.);lo=std::fma(a,r,lo);return ((hi+lo)-1.)*0x1p-1022;
}
extern "C" double em_square(double value){
 double x=std::abs(value);if(x==0||!std::isfinite(x))return x*x;uint64_t b=bits(x);if(b<0x10000000000000ULL){x=number(b|0x3ff0000000000000ULL)-1.;b=bits(x)+0xc020000000000000ULL;}
 uint64_t frac=b&0xfffffffffffffULL;double hi,lo;
 if(frac==0){hi=double(int64_t(b-0x3ff0000000000000ULL))*0x1p-45*2.;lo=0.;}
 else{
  int index=int(((frac+0x100000000000ULL)&0x1fe00000000000ULL)>>45);const auto*c=pow_log_coeff;uint64_t packed=bits(pow_log_table[index*2]);double recip=number(packed<<32),m=number(frac|0x3ff0000000000000ULL),prod=recip*m,mhi=number(bits(m)&0xffffffffffe00000ULL),mlow=m-mhi;double tail=std::fma(recip,mhi,-prod);double r=prod-1.;tail=std::fma(recip,mlow,tail);
  double polynomial=std::fma(r,c[0],c[1]);polynomial=std::fma(r,polynomial,c[2]);polynomial=std::fma(r,polynomial,c[3]);polynomial=std::fma(r,polynomial,c[4]);double fourth=r*r;fourth*=fourth;polynomial*=fourth;
  double u=std::fma(c[5],r,c[7]),v=std::fma(c[6],r,c[8]),e=u-c[7];e=std::fma(c[5],r,-e);v=std::fma(c[5],tail,v);v+=e;
  double a=std::fma(u,r,c[9]),d=std::fma(v,r,c[10]);e=a-c[9];e=std::fma(u,r,-e);d=std::fma(u,tail,d);d+=e;
  u=a*r;d*=r;e=std::fma(a,r,-u);d=std::fma(a,tail,d);e+=d;
  double exponent=double(int64_t(b+0xc018100000000000ULL)>>52),table=pow_log_table[index*2+1];double h=((exponent+table)+u)+polynomial;h=number(bits(h)&~1ULL);double t=((exponent-h)+table)+u;t+=polynomial;double low=number(packed&0xffffffff00000000ULL)+t;low+=e;
  hi=256.*h;lo=std::fma(256.,h,-hi);lo=std::fma(256.,low,lo);
 }
 if(hi>131072.)return INFINITY;if(hi<-137600.)return 0.;int64_t n=int64_t(std::floor(hi));double r=hi-std::floor(hi);int index=int(n)&127;double a=pow_exp_table[index*2],tail=(lo-pow_exp_table[index*2+1])+r;const auto*c=pow_exp_coeff;double p=std::fma(r,c[0],c[1]);p=std::fma(r,p,c[2]);p=std::fma(tail,p,c[3]);p=std::fma(tail,p,c[4]);p*=tail;
 uint64_t scale1=(uint64_t(n)<<44)&0xfff0000000000000ULL,scale2=((uint64_t(n)<<45)&0xfff0000000000000ULL)-scale1;double y=number(bits(a)+scale1);y=std::fma(y,p,y);return y*number(scale2+0x3ff0000000000000ULL);
}
