// Exact top-four neighbours of quantized OpenCV SIFT. No N x N allocation.
#include <cmath>
#include <cstdint>
#include <limits>
static int top4(const uint8_t* descriptors,const double* coords,const uint32_t* train,
                 int trainCount,uint32_t query,double minimum,double maximum,
                 double gapX,double gapY,int floatCoordinates,double* output,const uint32_t* precomputed) {
  double scores[4], distances[4]; uint32_t indices[4];
  for(int k=0;k<4;k++){scores[k]=std::numeric_limits<double>::infinity();indices[k]=UINT32_MAX;distances[k]=0;}
  int evaluated=0;
  for(int t=0;t<trainCount;t++){
    uint32_t j=train[t]; if(j==query)continue;
    double dx=coords[j*2]-coords[query*2],dy=coords[j*2+1]-coords[query*2+1],distance;
    if(floatCoordinates){
      float x=float(float(dx)-gapX),y=float(float(dy)-gapY);
      distance=std::sqrt(float(float(x*x)+float(y*y)));
    }else{dx-=gapX;dy-=gapY;distance=std::sqrt(dx*dx+dy*dy);}
    if(distance<minimum||distance>maximum)continue;
    evaluated++;
    uint32_t squared=precomputed?precomputed[j]:0;
    if(!precomputed)for(int d=0;d<128;d++){int delta=int(descriptors[j*128+d])-int(descriptors[query*128+d]);squared+=delta*delta;}
    int position=4;
    for(int k=0;k<4;k++)if(squared<scores[k]||(squared==scores[k]&&j<indices[k])){position=k;break;}
    if(position==4)continue;
    for(int k=3;k>position;k--){scores[k]=scores[k-1];indices[k]=indices[k-1];distances[k]=distances[k-1];}
    scores[position]=squared;indices[position]=j;distances[position]=distance;
  }
  for(int k=0;k<4;k++){output[k*3]=indices[k];output[k*3+1]=std::sqrt(float(scores[k]));output[k*3+2]=distances[k];}
  return evaluated;
}
extern "C" int sift_g2nn_top4(const uint8_t*d,const double*c,const uint32_t*t,int n,uint32_t q,double lo,double hi,double x,double y,int f,double*out){return top4(d,c,t,n,q,lo,hi,x,y,f,out,nullptr);}
extern "C" int sift_g2nn_precomputed(const uint32_t*d,const double*c,const uint32_t*t,int n,uint32_t q,double lo,double hi,double x,double y,int f,double*out){return top4(nullptr,c,t,n,q,lo,hi,x,y,f,out,d);}

// Query batches see every training block before applying the ratio test. State
// retains integer squared distances, so block boundaries cannot affect ties.
extern "C" int sift_g2nn_accumulate(const uint8_t* qd,const double* qc,const uint32_t* qi,int nq,
 const uint8_t* td,const double* tc,const uint32_t* ti,int nt,double lo,double hi,double gx,double gy,int f,double* state){
 int evaluated=0;
 for(int q=0;q<nq;q++)for(int t=0;t<nt;t++){
  if(qi[q]==ti[t])continue;double dx=tc[t*2]-qc[q*2],dy=tc[t*2+1]-qc[q*2+1],distance;
  if(f){float x=float(float(dx)-gx),y=float(float(dy)-gy);distance=std::sqrt(float(float(x*x)+float(y*y)));}
  else{dx-=gx;dy-=gy;distance=std::sqrt(dx*dx+dy*dy);}
  if(distance<lo||distance>hi)continue;evaluated++;uint32_t squared=0;
  for(int k=0;k<128;k++){int d=int(td[t*128+k])-int(qd[q*128+k]);squared+=d*d;}
  double* out=state+q*12;int position=4;
  for(int k=0;k<4;k++)if(squared<out[k*3+1]||(squared==out[k*3+1]&&ti[t]<out[k*3])){position=k;break;}
  if(position==4)continue;for(int k=3;k>position;k--)for(int d=0;d<3;d++)out[k*3+d]=out[(k-1)*3+d];
  out[position*3]=ti[t];out[position*3+1]=squared;out[position*3+2]=distance;
 }
 return evaluated;
}
