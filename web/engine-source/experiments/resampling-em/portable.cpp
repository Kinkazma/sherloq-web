// Development candidate only. Not imported by the runtime.
#include "blas.cpp"
#include "initial.h"
static double pairwise(const double* a,int n){
 if(n<8){double s=-0.;for(int i=0;i<n;i++)s+=a[i];return s;}
 if(n<=128){double r[8];std::copy(a,a+8,r);int i=8;for(;i+7<n;i+=8)for(int j=0;j<8;j++)r[j]+=a[i+j];double s=((r[0]+r[1])+(r[2]+r[3]))+((r[4]+r[5])+(r[6]+r[7]));for(;i<n;i++)s+=a[i];return s;}
 int cut=n/2;cut-=cut%8;return pairwise(a,cut)+pairwise(a+cut,n-cut);
}
static double sum(const double*a,int n){double value=0;for(int at=0;at<n;at+=8192)value+=pairwise(a+at,std::min(8192,n-at));return value;}
struct Workspace{
 int n,p;std::vector<double>F,f,a,w,normal,inverse,tmp,out;double sigma=.005;int iterations=0,status=1;
 Workspace(const double*image,int width,int height,int size):n((width-size+1)*(height-size+1)),p(size*size-1),F(n*p),f(n),a(p),w(n),normal(p*p),inverse(p*p),tmp(p*n),out(p){
  int border=size/2,rows=height-size+1,cols=width-size+1;for(int y=0;y<rows;y++)for(int x=0;x<cols;x++){int row=y*cols+x,column=0;for(int dy=0;dy<size;dy++)for(int dx=0;dx<size;dx++)if(dy!=border||dx!=border)F[row*p+column++]=image[(y+dy)*width+x+dx];f[row]=image[(y+border)*width+x+border];}
  std::copy(p==8?initial8:initial24,(p==8?initial8:initial24)+p,a.begin());
 }
 int step(){
  if(status!=1)return status;if(!std::isfinite(sigma)||sigma<=0)return status=-2;
  double s2=0;for(int row=0;row<n;row++){const double*v=F.data()+row*p;double total=a[0]*v[0];for(int k=1;k<p;k++)total+=a[k]*v[k];double r=f[row]-total,squared=std::pow(r,2.0),g=std::exp(-squared/sigma);w[row]=g/(g+.1);s2+=w[row]*squared;}
  double ws=sum(w.data(),n);if(ws==0)return status=-3;sigma=s2/ws;
  em_blas_gram(F.data(),w.data(),normal.data(),n,p);if(em_blas_inverse(normal.data(),inverse.data(),p))return status=-4;
  em_blas_product(inverse.data(),F.data(),tmp.data(),n,p);for(int y=0;y<p;y++)for(int x=0;x<n;x++)tmp[y*n+x]=(tmp[y*n+x]*w[x])*w[x];
  em_blas_vector(tmp.data(),f.data(),out.data(),n,p);
  double lanes[2]={};for(int i=0;i<p;i++){if(!std::isfinite(out[i]))return status=-5;double d=a[i]-out[i];lanes[i%2]+=d*d;}
  iterations++;if(std::sqrt(lanes[0]+lanes[1])<.01)return status=2;a=out;if(iterations>=100)return status=3;return status;
 }
};
extern "C" {
void* em_create(const double*image,int width,int height,int size){try{if((size!=3&&size!=5)||width<size||height<size||width>16384||height>16384)return nullptr;double low=INFINITY,high=-INFINITY;for(int i=0;i<width*height;i++){if(!std::isfinite(image[i]))return nullptr;low=std::min(low,image[i]);high=std::max(high,image[i]);}if(high==low)return nullptr;return new Workspace(image,width,height,size);}catch(...){return nullptr;}}
int em_step(void*h){try{return h?static_cast<Workspace*>(h)->step():-1;}catch(...){return -6;}}
int em_iterations(void*h){return h?static_cast<Workspace*>(h)->iterations:0;}
const double*em_weights(void*h){return h?static_cast<Workspace*>(h)->w.data():nullptr;}
void em_destroy(void*h){delete static_cast<Workspace*>(h);}
}
