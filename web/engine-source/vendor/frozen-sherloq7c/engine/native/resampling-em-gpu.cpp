// Same global native EM arithmetic, with independently replaceable matrix products.
// Positive128-point Gram parts and signed inverse-times-F dots can be supplied
// by exact binary64 GPU arithmetic. Every pending page has one native CPU
// fallback; compatibility exp/pow, LU and global8-lane reductions stay native.
#include "resampling-em-simd.cpp"
struct GpuEm:EmStream {
 bool awaiting=false;int pendingFirst=0,pendingCount=0;
 GpuEm(int w,int h,int sz):EmStream(w,h,sz){}
 int prepare(const double*gray,const double*oldweights,int first,int count,int top){
  if(awaiting)return -1;
  if(phase==1)return batch(gray,oldweights,first,count,top);
  if(status!=1||first!=next||count!=std::min(8192,n-first))return -1;features(gray,first,count,top);
  if(first==0){if(!std::isfinite(sigma)||sigma<=0)return status=-2;s2=ws=0;std::fill(normal.begin(),normal.end(),0.);std::fill(normalPartial.begin(),normalPartial.end(),0.);gramEnd=gramLength(n);}
  weights.resize(count);for(int i=0;i<count;i++){double total=a[0]*F[i*p];for(int k=1;k<p;k++)total+=a[k]*F[i*p+k];double sq=em_square(f[i]-total),g=em_exp(-sq/sigma);weights[i]=g/(g+.1);s2+=weights[i]*sq;}ws+=pairwise_em(weights.data(),count);
  pendingFirst=first;pendingCount=count;awaiting=true;next+=count;return 1;
 }
 int accept(const double*partials,int blocks){
  if(!awaiting||phase!=0)return -1;int end=gramEnd,at=pendingFirst,needed=0,limit=pendingFirst+pendingCount;
  while(at<limit){if(end<=at)return -1;at=std::min(end,limit);needed++;if(at==end&&end<n)end+=gramLength(n-end);}if(needed!=blocks)return -1;
  // The first GPU sum begins with this page's native normalPartial carry.
  // Only completed global sub-reductions enter normal; a cut page retains its
  // unfinished sum for the following page, before the next native FMA.
  for(int k=0;k<p*p;k++){double value=normal[k],partial=normalPartial[k];int boundary=gramEnd,position=pendingFirst;
   for(int block=0;block<blocks;block++){double sum=partials[block*p*p+k];position=std::min(boundary,limit);if(position==boundary){value+=sum;partial=0.;if(boundary<n)boundary+=gramLength(n-boundary);}else partial=sum;}
   normal[k]=value;normalPartial[k]=partial;
  }gramEnd=end;awaiting=false;return 1;
 }
 int acceptCpu(){
  if(!awaiting||phase!=0)return -1;int followingEnd=gramEnd;
  for(int y=0;y<p;y++)for(int x=0;x<p;x+=2){v128_t value=wasm_v128_load(normal.data()+y*p+x),sum=wasm_v128_load(normalPartial.data()+y*p+x);int end=gramEnd;
   for(int at=0;at<pendingCount;){const int stop=std::min(pendingCount,end-pendingFirst);for(int k=at;k<stop;k++){double v=(F[k*p+y]*weights[k])*weights[k];sum=emPair(wasm_f64x2_splat(v),wasm_v128_load(F.data()+k*p+x),sum);}at=stop;
    if(pendingFirst+at==end){value=wasm_f64x2_add(value,sum);sum=wasm_f64x2_splat(0);if(end<n)end+=gramLength(n-end);}
   }wasm_v128_store(normal.data()+y*p+x,value);wasm_v128_store(normalPartial.data()+y*p+x,sum);followingEnd=end;
  }gramEnd=followingEnd;awaiting=false;return 1;
 }
};
struct BothEm:GpuEm{
 bool awaitingProduct=false;
 BothEm(int w,int h,int size):GpuEm(w,h,size){}
 int prepareBoth(const double*gray,const double*oldweights,int first,int count,int top){
  if(awaitingProduct)return -1;if(phase==0)return prepare(gray,oldweights,first,count,top);
  if(awaiting||status!=1||first!=next||count!=std::min(8192,n-first)||!oldweights)return -1;
  features(gray,first,count,top);weights.assign(oldweights,oldweights+count);pendingFirst=first;pendingCount=count;next+=count;awaitingProduct=true;return 1;
 }
 int acceptProduct(const double*product){
  if(!awaitingProduct||phase!=1)return -1;int first=pendingFirst,count=pendingCount,main=std::max(0,std::min(count,(n/32)*32-first));
  for(int row=0;row<p;row++){
   auto value=[&](int i){double sum=0;if(product)sum=product[row*count+i];else for(int k=0;k<p;k++)sum=emFma(inverse[row*p+k],F[i*p+k],sum);return(sum*weights[i])*weights[i];};
   auto value2=[&](int i){v128_t sum=wasm_f64x2_splat(0);if(product)sum=wasm_v128_load(product+row*count+i);else for(int k=0;k<p;k++)sum=emPair(wasm_f64x2_splat(inverse[row*p+k]),wasm_f64x2_make(F[i*p+k],F[(i+1)*p+k]),sum);const auto w=wasm_v128_load(weights.data()+i);return wasm_f64x2_mul(wasm_f64x2_mul(sum,w),w);};
   double*r=lanes.data()+row*8;int i=0;for(;i<main;i+=2){const int lane=(first+i)%8;wasm_v128_store(r+lane,emPair(value2(i),wasm_v128_load(f.data()+i),wasm_v128_load(r+lane)));}
   if(first+count==n){double l=((r[0]+r[2])+r[4])+r[6],rr=((r[1]+r[3])+r[5])+r[7];v128_t lr=wasm_f64x2_make(l,rr);for(;i+3<count;i+=4){lr=emPair(value2(i),wasm_v128_load(f.data()+i),lr);lr=emPair(value2(i+2),wasm_v128_load(f.data()+i+2),lr);}double sum=wasm_f64x2_extract_lane(lr,0)+wasm_f64x2_extract_lane(lr,1);for(;i<count;i++)sum=emFma(value(i),f[i],sum);out[row]=sum;}
  }awaitingProduct=false;return 1;
 }
};
extern "C"{
void* em_gpu_create(int w,int h,int size){try{if((size!=3&&size!=5)||w<size||h<size||w>16384||h>16384||1LL*w*h>0x7fffffff)return nullptr;return new BothEm(w,h,size);}catch(...){return nullptr;}}
int em_gpu_batch(void*ptr,const double*gray,const double*w,int first,int count,int top){try{return ptr?static_cast<BothEm*>(ptr)->prepareBoth(gray,w,first,count,top):-1;}catch(...){return -6;}}
int em_gpu_accept_gram(void*ptr,const double*partials,int blocks){return ptr?static_cast<BothEm*>(ptr)->accept(partials,blocks):-1;}
int em_gpu_accept_product(void*ptr,const double*product){return ptr?static_cast<BothEm*>(ptr)->acceptProduct(product):-1;}
int em_gpu_accept_cpu(void*ptr){if(!ptr)return -1;auto*s=static_cast<BothEm*>(ptr);return s->phase==0?s->acceptCpu():s->acceptProduct(nullptr);}
int em_gpu_finish(void*ptr){if(!ptr)return -1;auto*s=static_cast<BothEm*>(ptr);if(s->awaiting||s->awaitingProduct)return -1;return s->finish();}
const double*em_gpu_gram_carry(void*ptr){return ptr?static_cast<BothEm*>(ptr)->normalPartial.data():nullptr;}
const double*em_gpu_weights(void*ptr){return ptr?static_cast<BothEm*>(ptr)->weights.data():nullptr;}
const double*em_gpu_inverse(void*ptr){return ptr?static_cast<BothEm*>(ptr)->inverse.data():nullptr;}
int em_gpu_iterations(void*ptr){return ptr?static_cast<BothEm*>(ptr)->iteration:0;}
void em_gpu_destroy(void*ptr){delete static_cast<BothEm*>(ptr);}
}
