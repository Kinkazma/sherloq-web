// Offline parity study only; not a callable product engine.
// OpenCV-derived LU variant follows the license at vendor/opencv/LICENSE.
#include <opencv2/core.hpp>
#include <cmath>
#include <vector>
#include <algorithm>
#include <memory>
#include "initial.h"
static double sum(const double* a,int n){
 if(n<8){double s=-0.;for(int i=0;i<n;i++)s+=a[i];return s;}
 if(n<=128){double r[8];std::copy(a,a+8,r);int i=8;for(;i+7<n;i+=8)for(int j=0;j<8;j++)r[j]+=a[i+j];double s=((r[0]+r[1])+(r[2]+r[3]))+((r[4]+r[5])+(r[6]+r[7]));for(;i<n;i++)s+=a[i];return s;}
 int cut=n/2;cut-=cut%8;return sum(a,cut)+sum(a+cut,n-cut);
}
// Experimental adaptation of OpenCV4.11 LUImpl: exact-zero pivot criterion,
// corresponding to LAPACK's singularity rule; not a product policy change.
static bool inverseExactZero(const cv::Mat& matrix,cv::Mat& result){
 cv::Mat A=matrix.clone();int n=A.rows;result=cv::Mat::eye(n,n,CV_64F);
 for(int i=0;i<n;i++){
  int pivot=i;for(int j=i+1;j<n;j++)if(std::abs(A.at<double>(j,i))>std::abs(A.at<double>(pivot,i)))pivot=j;
  if(A.at<double>(pivot,i)==0)return false;
  if(pivot!=i){for(int k=i;k<n;k++)std::swap(A.at<double>(i,k),A.at<double>(pivot,k));for(int k=0;k<n;k++)std::swap(result.at<double>(i,k),result.at<double>(pivot,k));}
  double d=-1/A.at<double>(i,i);for(int j=i+1;j<n;j++){double alpha=A.at<double>(j,i)*d;for(int k=i+1;k<n;k++)A.at<double>(j,k)+=alpha*A.at<double>(i,k);for(int k=0;k<n;k++)result.at<double>(j,k)+=alpha*result.at<double>(i,k);}
 }
 for(int i=n-1;i>=0;i--)for(int j=0;j<n;j++){double s=result.at<double>(i,j);for(int k=i+1;k<n;k++)s-=A.at<double>(i,k)*result.at<double>(k,j);result.at<double>(i,j)=s/A.at<double>(i,i);}
 return true;
}
struct Workspace{
 cv::Mat F,f,FT,weighted,normal,inverse,tmp,out;std::vector<double> a,w;double sigma=.005;int iterations=0,status=1;
 Workspace(const double* image,int width,int height,int size):F((width-size+1)*(height-size+1),size*size-1,CV_64F),f(F.rows,1,CV_64F),a(F.cols),w(F.rows){
  const int border=size/2,rows=height-size+1,cols=width-size+1;for(int y=0;y<rows;y++)for(int x=0;x<cols;x++){int row=y*cols+x,column=0;for(int dy=0;dy<size;dy++)for(int dx=0;dx<size;dx++)if(dy!=border||dx!=border)F.at<double>(row,column++)=image[(y+dy)*width+x+dx];f.at<double>(row)=image[(y+border)*width+x+border];}
  std::copy(F.cols==8?initial8:initial24,(F.cols==8?initial8:initial24)+F.cols,a.begin());cv::transpose(F,FT);weighted=FT.clone();
 }
 int step(){
  if(status!=1)return status;
  if(!std::isfinite(sigma)||sigma<=0)return status=-2;
  double s2=0;for(int row=0;row<F.rows;row++){const double* v=F.ptr<double>(row);double total=a[0]*v[0];for(int k=1;k<F.cols;k++)total+=a[k]*v[k];double r=f.at<double>(row)-total,squared=std::pow(r,2.0),g=std::exp(-squared/sigma);w[row]=g/(g+.1);s2+=w[row]*squared;}
  const double weightSum=sum(w.data(),w.size());if(weightSum==0)return status=-3;sigma=s2/weightSum;
  for(int y=0;y<F.cols;y++)for(int x=0;x<F.rows;x++){double v=FT.at<double>(y,x)*w[x];weighted.at<double>(y,x)=v*w[x];}
  cv::gemm(weighted,F,1,cv::Mat(),0,normal);if(!inverseExactZero(normal,inverse))return status=-4;
  cv::gemm(inverse,FT,1,cv::Mat(),0,tmp);for(int y=0;y<F.cols;y++)for(int x=0;x<F.rows;x++){double v=tmp.at<double>(y,x)*w[x];tmp.at<double>(y,x)=v*w[x];}
  cv::gemm(tmp,f,1,cv::Mat(),0,out);double norm=0;for(int i=0;i<F.cols;i++){double next=out.at<double>(i);if(!std::isfinite(next))return status=-5;double d=a[i]-next;norm+=d*d;}
  iterations++;if(std::sqrt(norm)<.01)return status=2;for(int i=0;i<F.cols;i++)a[i]=out.at<double>(i);if(iterations>=100)return status=3;return status;
 }
};
extern "C" {
void* em_create(const double* image,int width,int height,int size){try{if((size!=3&&size!=5)||width<size||height<size||width>16384||height>16384)return nullptr;double low=INFINITY,high=-INFINITY;for(int i=0;i<width*height;i++){if(!std::isfinite(image[i]))return nullptr;low=std::min(low,image[i]);high=std::max(high,image[i]);}if(high==low)return nullptr;return new Workspace(image,width,height,size);}catch(...){return nullptr;}}
int em_step(void* handle){try{return handle?static_cast<Workspace*>(handle)->step():-1;}catch(...){return -6;}}
int em_iterations(void* handle){return handle?static_cast<Workspace*>(handle)->iterations:0;}
const double* em_weights(void* handle){return handle?static_cast<Workspace*>(handle)->w.data():nullptr;}
void em_destroy(void* handle){delete static_cast<Workspace*>(handle);}
}
