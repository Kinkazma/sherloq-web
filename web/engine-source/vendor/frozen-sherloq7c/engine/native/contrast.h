// Native ContrastEngine block indicators; display is separate from analysis.
#include "contrast-window.h"
template<class T> static T contrastSum(const T* a,size_t n){
 if(n<8){T s=-T(0);for(size_t i=0;i<n;i++)s+=a[i];return s;}
 if(n<=128){T r[8];for(int j=0;j<8;j++)r[j]=a[j];size_t i=8;for(;i<n-n%8;i+=8)for(int j=0;j<8;j++)r[j]+=a[i+j];T s=((r[0]+r[1])+(r[2]+r[3]))+((r[4]+r[5])+(r[6]+r[7]));for(;i<n;i++)s+=a[i];return s;}
 size_t cut=n/2;cut-=cut%8;return contrastSum(a,cut)+contrastSum(a+cut,n-cut);
}
// NumPy1.26 reduction iterator combines consecutive8192-element partial sums.
// Each partial retains the pairwise128/8-lane order above. A single recursive
// sum of all65536values changes float32 means at the256pixel block size.
static float contrastMean(const std::vector<float>& values){
 float sum=0;for(size_t offset=0;offset<values.size();offset+=8192)sum+=contrastSum(values.data()+offset,std::min(size_t(8192),values.size()-offset));return sum/float(values.size());
}
static cv::Mat contrastNorm(const cv::Mat& input){
 double low,high;cv::minMaxLoc(input,&low,&high);double scale=high-low>DBL_EPSILON?1./(high-low):0.,shift=-low*scale;cv::Mat out(input.size(),CV_64F);for(int i=0;i<input.total();i++)out.ptr<double>()[i]=std::fma(input.ptr<double>()[i],scale,shift);return out;
}
static double contrastHistogram(const cv::Mat& gray){
 double hist[256]={0};for(int y=0;y<gray.rows;y++)for(int x=0;x<gray.cols;x++)hist[gray.at<uchar>(y,x)]++;
 for(int i=0;i<256;i++)hist[i]*=contrastWindow[i];cv::Mat h=contrastNorm(cv::Mat(256,1,CV_64F,hist)),dft;cv::dft(h,dft,cv::DFT_COMPLEX_OUTPUT);cv::Mat magnitude(256,1,CV_64F);
 for(int i=0;i<256;i++){auto p=dft.at<cv::Vec2d>((i+128)%256,0);magnitude.at<double>(i)=std::sqrt(std::fma(p[1],p[1],p[0]*p[0]));}auto mag=contrastNorm(magnitude);double diff=0,weighted[256];
 for(int i=0;i<252;i++){double left=2*h.at<double>(i+1)-h.at<double>(i),right=2*h.at<double>(i+3)-h.at<double>(i+4);diff=std::max(diff,std::abs(h.at<double>(i+2)-(left+right)/2));}
 const double ed=contrastSum(mag.ptr<double>(),256);if(ed==0)return 0;
 for(int i=0;i<256;i++){double x=double(i-128)/128;weighted[i]=mag.at<double>(i)*(x*x);}double error=contrastSum(weighted,256)/ed;error=error>.185?1:error/.185;return error*std::sqrt(diff);
}
static cv::Mat contrastMaps(const cv::Mat& bgr,int block){
 cv::Mat color,gray;cv::copyMakeBorder(bgr,color,0,block-bgr.rows%block,0,block-bgr.cols%block,cv::BORDER_CONSTANT);cv::cvtColor(color,gray,cv::COLOR_BGR2GRAY);
 cv::Mat kx,ky;cv::getDerivKernels(kx,ky,1,1,1);std::vector<cv::Mat> channels;cv::split(color,channels);for(auto& c:channels)cv::sepFilter2D(c,c,CV_32F,kx,ky);
 cv::Mat tri(color.size(),CV_32F),avg(color.size(),CV_32F);for(int y=0;y<color.rows;y++)for(int x=0;x<color.cols;x++){
  float b=channels[0].at<float>(y,x),g=channels[1].at<float>(y,x),r=channels[2].at<float>(y,x);tri.at<float>(y,x)=((std::abs(g-r)+std::abs(g-b))+std::abs(r-b))/3.f;avg.at<float>(y,x)=((std::abs(b)+std::abs(g))+std::abs(r))/3.f;
 }
 int nr=color.rows/block,nc=color.cols/block;cv::Mat maps(nr+1,nc+1,CV_32FC3,cv::Scalar::all(0));std::vector<float> at(block*block),tt(block*block);
 for(int r=0;r<nr;r++)for(int c=0;c<nc;c++){
  cv::Rect rect(c*block,r*block,block,block);double error=contrastHistogram(gray(rect));for(int y=0;y<block;y++)for(int x=0;x<block;x++){at[y*block+x]=avg.at<float>(r*block+y,c*block+x);tt[y*block+x]=tri.at<float>(r*block+y,c*block+x);}
  float am=contrastMean(at),tm=contrastMean(tt);double similarity=0;if(am!=0){float ratio=tm/am;similarity=ratio>.75?1:double(ratio)/.75;}maps.at<cv::Vec3f>(r,c)={float(error),float(similarity),float(error*similarity)};
 }return maps;
}
static cv::Mat contrastView(const cv::Mat& maps,int width,int height,int block,int mode){cv::Mat plane,out;cv::extractChannel(maps,plane,mode);cv::convertScaleAbs(plane,plane,255);cv::medianBlur(plane,plane,3);cv::resize(plane,out,{},block,block,cv::INTER_NEAREST);out=out(cv::Rect(0,0,width,height));cv::cvtColor(out,out,cv::COLOR_GRAY2RGB);return out;}
