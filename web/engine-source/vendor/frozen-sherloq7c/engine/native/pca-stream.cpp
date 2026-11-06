// Streaming form of the qualified OpenCV PCA arithmetic. GPL-3.0-or-later.
#include <cmath>
#include <cfloat>
#include <cstdint>
#include <algorithm>
static double hypotReference(double a,double b){a=std::abs(a);b=std::abs(b);if(a>b){b/=a;return a*std::sqrt(std::fma(b,b,1.));}if(b>0){a/=b;return b*std::sqrt(std::fma(a,a,1.));}return 0;}
static void eigenReference(double* a,double* w,double* v){
 int ir[3]={0},ic[3]={0};std::fill(v,v+9,0.);for(int k=0;k<3;k++){w[k]=a[4*k];v[4*k]=1.;}
 auto indices=[&](int k){if(k<2){int m=k+1;for(int i=k+2;i<3;i++)if(std::abs(a[k*3+m])<std::abs(a[k*3+i]))m=i;ir[k]=m;}if(k>0){int m=0;for(int i=1;i<k;i++)if(std::abs(a[m*3+k])<std::abs(a[i*3+k]))m=i;ic[k]=m;}};for(int k=0;k<3;k++)indices(k);
 for(int iteration=0;iteration<270;iteration++){
  int k=0,l=ir[0];double mv=std::abs(a[l]);for(int i=1;i<2;i++)if(mv<std::abs(a[i*3+ir[i]])){mv=std::abs(a[i*3+ir[i]]);k=i;l=ir[i];}for(int i=1;i<3;i++)if(mv<std::abs(a[ic[i]*3+i])){mv=std::abs(a[ic[i]*3+i]);k=ic[i];l=i;}
  double p=a[k*3+l];if(std::abs(p)<=DBL_EPSILON)break;double y=(w[l]-w[k])*.5,t=std::abs(y)+hypotReference(p,y),sn=hypotReference(p,t),c=t/sn;sn=p/sn;t=(p/t)*p;if(y<0){sn=-sn;t=-t;}a[k*3+l]=0;w[k]-=t;w[l]+=t;
  auto rotate=[&](double& x,double& y){double aa=x,bb=y;x=std::fma(aa,c,-bb*sn);y=std::fma(aa,sn,bb*c);};
  for(int i=0;i<k;i++)rotate(a[i*3+k],a[i*3+l]);for(int i=k+1;i<l;i++)rotate(a[k*3+i],a[i*3+l]);for(int i=l+1;i<3;i++)rotate(a[k*3+i],a[l*3+i]);for(int i=0;i<3;i++)rotate(v[k*3+i],v[l*3+i]);indices(k);indices(l);
 }
 for(int k=0;k<2;k++){int m=k;for(int i=k+1;i<3;i++)if(w[m]<w[i])m=i;if(k!=m){std::swap(w[k],w[m]);for(int i=0;i<3;i++)std::swap(v[k*3+i],v[m*3+i]);}}
}

extern "C" {
void pca_stream_mean(const unsigned char* rgb,int count,double* sums){
 for(int i=0;i<count;i++)for(int c=0;c<3;c++)sums[c]+=rgb[3*i+2-c];
}
void pca_stream_cov(const unsigned char* rgb,int count,const double* mean,double* cov){
 for(int i=0;i<3;i++)for(int j=i;j<3;j++){
  double sum=cov[i*3+j];for(int k=0;k<count;k++)sum=std::fma(double(rgb[k*3+2-i])-mean[i],double(rgb[k*3+2-j])-mean[j],sum);cov[i*3+j]=sum;
 }
}
void pca_stream_finish(const double* sums,double* cov,double total,double* model){
 for(int i=0;i<3;i++)model[i]=sums[i];
 for(int i=0;i<3;i++)for(int j=i;j<3;j++)cov[i*3+j]=cov[j*3+i]=cov[i*3+j]*(1./total);
 eigenReference(cov,model+12,model+3);
}
void pca_stream_project(const unsigned char* rgb,int count,const double* model,int component,int mode,double* out){
 const double* v=model+3+component*3;const double length=std::sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);
 for(int i=0;i<count;i++){
  double d[3],cross[3];for(int c=0;c<3;c++)d[c]=double(rgb[3*i+2-c])-model[c];
  if(mode==1){double sum=0;for(int k=0;k<3;k++)sum=std::fma(d[k],v[k],sum);out[i]=sum;continue;}
  for(int c=0;c<3;c++){int j=(c+1)%3,k=(c+2)%3;cross[c]=d[j]*v[k]-d[k]*v[j];}
  if(mode==0)out[i]=std::sqrt((cross[0]*cross[0]+cross[1]*cross[1])+cross[2]*cross[2])/length;
  else for(int c=0;c<3;c++)out[3*i+c]=cross[c];
 }
}
void pca_stream_normalize(const double* raw,int count,int channels,const double* limits,double total,int invert,unsigned char* out){
 for(int i=0;i<count;i++)for(int c=0;c<3;c++){
  int k=channels==1?0:2-c;double lo=limits[2*k],hi=limits[2*k+1],scale=hi-lo>DBL_EPSILON?255.*(1./(hi-lo)):0.,shift=-lo*scale;
  double value=total>=4?std::fma(raw[i*channels+k],scale,shift):raw[i*channels+k]*scale+shift;
  unsigned char v=std::isfinite(value)?static_cast<unsigned char>(static_cast<int64_t>(std::trunc(value))&255):0;out[3*i+c]=invert?255-v:v;
 }
}
void pca_stream_lut(const double* histogram,double total,unsigned char* lut){
 for(int c=0;c<3;c++){
  const double* h=histogram+256*c;int first=0;while(first<255&&!h[first])first++;
  if(h[first]==total){for(int i=0;i<256;i++)lut[256*c+i]=first;continue;}
  float scale=255.f/float(total-h[first]);double sum=0;
  for(int i=0;i<=first;i++)lut[256*c+i]=0;
  for(int i=first+1;i<256;i++){sum+=h[i];lut[256*c+i]=std::max(0.f,std::min(255.f,std::nearbyint(float(sum)*scale)));}
 }
}
}
