// Exact guarded binary64 FMA, paired across independent columns/points only.
// Preserve original 128-point Gram and 8-lane coefficient reduction chains.
#include <initializer_list>
#include "prnu-fma.cpp"
static inline double emFma(double x,double y,double z){return comparisonFmaFast(x,y,z);}
static inline v128_t emPair(v128_t x,v128_t y,v128_t z){return fmaPair(x,y,z);}
// Same global EM fit, bounded neighborhoods and ordered reductions across pages.
#include "resampling-em-simd-blas.cpp"
#include "../vendor/resampling-em-source/initial.h"
#include "resampling-em-simd-math.cpp"
static double pairwise_em(const double* a,int n){
 if(n<8){double s=-0.;for(int i=0;i<n;i++)s+=a[i];return s;}
 if(n<=128){double r[8];std::copy(a,a+8,r);int i=8;for(;i+7<n;i+=8)for(int j=0;j<8;j++)r[j]+=a[i+j];double s=((r[0]+r[1])+(r[2]+r[3]))+((r[4]+r[5])+(r[6]+r[7]));for(;i<n;i++)s+=a[i];return s;}
 int cut=n/2;cut-=cut%8;return pairwise_em(a,cut)+pairwise_em(a+cut,n-cut);
}
struct EmStream {
 int width,height,size,n,p,cols,iteration=0,next=0,phase=0,status=1,gramEnd=0;double sigma=.005,s2=0,ws=0;
 std::vector<double>a,normal,normalPartial,inverse,lanes,out,F,f,weights;
 EmStream(int w,int h,int sz):width(w),height(h),size(sz),n((w-sz+1)*(h-sz+1)),p(sz*sz-1),cols(w-sz+1),a(p),normal(p*p),normalPartial(p*p),inverse(p*p),lanes(p*8),out(p){std::copy(p==8?initial8:initial24,(p==8?initial8:initial24)+p,a.begin());}
 // Native Gram sub-reductions are defined on the complete global fit. A
 // transport page may end inside one: carry its FMA accumulator, and add it to
 // normal only at the same global boundary. Never read beyond the current F.
 int gramLength(int remaining)const{if(remaining>=256)return 128;if(remaining>128)return 1LL*n*p*p>262144?(remaining+1)/2:((remaining/2+7)/8)*8;return remaining;}
 void features(const double* gray,int first,int count,int top){F.resize(count*p);f.resize(count);for(int i=0;i<count;i++){int y=(first+i)/cols-top,x=(first+i)%cols,column=0;for(int dy=0;dy<size;dy++)for(int dx=0;dx<size;dx++)if(dy!=size/2||dx!=size/2)F[i*p+column++]=gray[(y+dy)*width+x+dx];f[i]=gray[(y+size/2)*width+x+size/2];}}
 int batch(const double* gray,const double* oldweights,int first,int count,int top){
  if(status!=1||first!=next||count!=std::min(8192,n-first))return -1;features(gray,first,count,top);
  if(phase==0){if(first==0){if(!std::isfinite(sigma)||sigma<=0)return status=-2;s2=ws=0;std::fill(normal.begin(),normal.end(),0.);std::fill(normalPartial.begin(),normalPartial.end(),0.);gramEnd=gramLength(n);}
   weights.resize(count);for(int i=0;i<count;i++){double total=a[0]*F[i*p];for(int k=1;k<p;k++)total+=a[k]*F[i*p+k];double sq=em_square(f[i]-total),g=em_exp(-sq/sigma);weights[i]=g/(g+.1);s2+=weights[i]*sq;}ws+=pairwise_em(weights.data(),count);
   int followingEnd=gramEnd;
   for(int y=0;y<p;y++)for(int x=0;x<p;x+=2){v128_t value=wasm_v128_load(normal.data()+y*p+x),sum=wasm_v128_load(normalPartial.data()+y*p+x);int end=gramEnd;
    for(int at=0;at<count;){const int stop=std::min(count,end-first);for(int k=at;k<stop;k++){double v=(F[k*p+y]*weights[k])*weights[k];sum=emPair(wasm_f64x2_splat(v),wasm_v128_load(F.data()+k*p+x),sum);}at=stop;
     if(first+at==end){value=wasm_f64x2_add(value,sum);sum=wasm_f64x2_splat(0);if(end<n)end+=gramLength(n-end);}
    }wasm_v128_store(normal.data()+y*p+x,value);wasm_v128_store(normalPartial.data()+y*p+x,sum);followingEnd=end;
   }gramEnd=followingEnd;
  }else{
   int main=std::max(0,std::min(count,(n/32)*32-first));
   for(int row=0;row<p;row++){
    auto value=[&](int i){double sum=0;for(int k=0;k<p;k++)sum=emFma(inverse[row*p+k],F[i*p+k],sum);return(sum*oldweights[i])*oldweights[i];};
    auto value2=[&](int i){v128_t sum=wasm_f64x2_splat(0);for(int k=0;k<p;k++)sum=emPair(wasm_f64x2_splat(inverse[row*p+k]),wasm_f64x2_make(F[i*p+k],F[(i+1)*p+k]),sum);const auto w=wasm_v128_load(oldweights+i);return wasm_f64x2_mul(wasm_f64x2_mul(sum,w),w);};
    double*r=lanes.data()+row*8;int i=0;for(;i<main;i+=2){const int lane=(first+i)%8;wasm_v128_store(r+lane,emPair(value2(i),wasm_v128_load(f.data()+i),wasm_v128_load(r+lane)));}
    if(first+count==n){double l=((r[0]+r[2])+r[4])+r[6],rr=((r[1]+r[3])+r[5])+r[7];v128_t lr=wasm_f64x2_make(l,rr);for(;i+3<count;i+=4){lr=emPair(value2(i),wasm_v128_load(f.data()+i),lr);lr=emPair(value2(i+2),wasm_v128_load(f.data()+i+2),lr);}double sum=wasm_f64x2_extract_lane(lr,0)+wasm_f64x2_extract_lane(lr,1);for(;i<count;i++)sum=emFma(value(i),f[i],sum);out[row]=sum;}
   }
  }next+=count;return 1;
 }
 int finish(){if(status!=1||next!=n)return -1;next=0;if(phase==0){if(ws==0)return status=-3;sigma=s2/ws;if(em_blas_inverse(normal.data(),inverse.data(),p))return status=-4;std::fill(lanes.begin(),lanes.end(),0.);phase=1;return 1;}
  double norm[2]={};for(int i=0;i<p;i++){if(!std::isfinite(out[i]))return status=-5;double d=a[i]-out[i];norm[i%2]+=d*d;}iteration++;if(std::sqrt(norm[0]+norm[1])<.01)return status=2;a=out;if(iteration>=100)return status=3;phase=0;return 1;
 }
};
extern "C" {
void* em_stream_create(int w,int h,int size){try{if((size!=3&&size!=5)||w<size||h<size||1LL*w*h>0x7fffffff)return nullptr;return new EmStream(w,h,size);}catch(...){return nullptr;}}
int em_stream_batch(void* ptr,const double* gray,const double* weights,int first,int count,int top){try{return ptr?static_cast<EmStream*>(ptr)->batch(gray,weights,first,count,top):-1;}catch(...){return -6;}}
int em_stream_finish(void* ptr){try{return ptr?static_cast<EmStream*>(ptr)->finish():-1;}catch(...){return -6;}}
const double* em_stream_weights(void* ptr){return ptr?static_cast<EmStream*>(ptr)->weights.data():nullptr;}
int em_stream_iterations(void* ptr){return ptr?static_cast<EmStream*>(ptr)->iteration:0;}
void em_stream_destroy(void* ptr){delete static_cast<EmStream*>(ptr);}
}
