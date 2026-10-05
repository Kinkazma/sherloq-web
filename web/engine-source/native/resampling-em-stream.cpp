// Same global EM fit, bounded neighborhoods and ordered reductions across pages.
#include "../vendor/resampling-em-source/blas.cpp"
#include "../vendor/resampling-em-source/initial.h"
#include "../vendor/resampling-em-source/math.cpp"
static double pairwise_em(const double* a,int n){
 if(n<8){double s=-0.;for(int i=0;i<n;i++)s+=a[i];return s;}
 if(n<=128){double r[8];std::copy(a,a+8,r);int i=8;for(;i+7<n;i+=8)for(int j=0;j<8;j++)r[j]+=a[i+j];double s=((r[0]+r[1])+(r[2]+r[3]))+((r[4]+r[5])+(r[6]+r[7]));for(;i<n;i++)s+=a[i];return s;}
 int cut=n/2;cut-=cut%8;return pairwise_em(a,cut)+pairwise_em(a+cut,n-cut);
}
struct EmStream {
 int width,height,size,n,p,cols,iteration=0,next=0,phase=0,status=1;double sigma=.005,s2=0,ws=0;
 std::vector<double>a,normal,inverse,lanes,out,F,f,weights;
 EmStream(int w,int h,int sz):width(w),height(h),size(sz),n((w-sz+1)*(h-sz+1)),p(sz*sz-1),cols(w-sz+1),a(p),normal(p*p),inverse(p*p),lanes(p*8),out(p){std::copy(p==8?initial8:initial24,(p==8?initial8:initial24)+p,a.begin());}
 void features(const double* gray,int first,int count,int top){F.resize(count*p);f.resize(count);for(int i=0;i<count;i++){int y=(first+i)/cols-top,x=(first+i)%cols,column=0;for(int dy=0;dy<size;dy++)for(int dx=0;dx<size;dx++)if(dy!=size/2||dx!=size/2)F[i*p+column++]=gray[(y+dy)*width+x+dx];f[i]=gray[(y+size/2)*width+x+size/2];}}
 int batch(const double* gray,const double* oldweights,int first,int count,int top){
  if(status!=1||first!=next||count!=std::min(8192,n-first))return -1;features(gray,first,count,top);
  if(phase==0){if(first==0){if(!std::isfinite(sigma)||sigma<=0)return status=-2;s2=ws=0;std::fill(normal.begin(),normal.end(),0.);}
   weights.resize(count);for(int i=0;i<count;i++){double total=a[0]*F[i*p];for(int k=1;k<p;k++)total+=a[k]*F[i*p+k];double sq=em_square(f[i]-total),g=em_exp(-sq/sigma);weights[i]=g/(g+.1);s2+=weights[i]*sq;}ws+=pairwise_em(weights.data(),count);
   for(int y=0;y<p;y++)for(int x=0;x<p;x++){double value=normal[y*p+x];for(int at=0;at<count;){int length=n-first-at;if(length>=256)length=128;else if(length>128)length=(1LL*n*p*p>262144?(length+1)/2:((length/2+7)/8)*8);double sum=0;for(int k=at;k<at+length;k++){double v=(F[k*p+y]*weights[k])*weights[k];sum=std::fma(v,F[k*p+x],sum);}value+=sum;at+=length;}normal[y*p+x]=value;}
  }else{
   int main=std::min(count,(n/32)*32-first);main=std::max(0,main);
   for(int row=0;row<p;row++){
    auto value=[&](int i){double sum=0;for(int k=0;k<p;k++)sum=std::fma(inverse[row*p+k],F[i*p+k],sum);return (sum*oldweights[i])*oldweights[i];};
    double* r=lanes.data()+row*8;int i=0;for(;i<main;i++)r[(first+i)%8]=std::fma(value(i),f[i],r[(first+i)%8]);
    if(first+count==n){double l=((r[0]+r[2])+r[4])+r[6],rr=((r[1]+r[3])+r[5])+r[7];for(;i+3<count;i+=4){l=std::fma(value(i),f[i],l);rr=std::fma(value(i+1),f[i+1],rr);l=std::fma(value(i+2),f[i+2],l);rr=std::fma(value(i+3),f[i+3],rr);}double sum=l+rr;for(;i<count;i++)sum=std::fma(value(i),f[i],sum);out[row]=sum;}
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
