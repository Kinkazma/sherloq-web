#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <vector>
#include <algorithm>
#include <cmath>
#include <cfloat>
#include <cstring>
// NumPy contiguous reductions: eight lanes, recursive cuts aligned to eight.
template<class T> T sum(const std::vector<T>& a,int start,int n){
 if(n<8){T s=-0.;for(int i=0;i<n;i++)s+=a[start+i];return s;}
 if(n<=128){T r[8];for(int j=0;j<8;j++)r[j]=a[start+j];int i=8;for(;i<n-n%8;i+=8)for(int j=0;j<8;j++)r[j]+=a[start+i+j];T s=((r[0]+r[1])+(r[2]+r[3]))+((r[4]+r[5])+(r[6]+r[7]));for(;i<n;i++)s+=a[start+i];return s;}
 int cut=n/2;cut-=cut%8;return sum(a,start,cut)+sum(a,start+cut,n-cut);
}
float average(const std::vector<float>& a,int block){float total=0;for(int y=0;y<block;y++)total+=sum(a,y*block,block);return total/(float)a.size();}
int reflect(int x,int n){if(n==1)return 0;while(x<0||x>=n)x=x<0?-x:2*n-x-2;return x;}
void nativeYcc(const cv::Mat& src,cv::Mat& dst){dst.create(src.size(),CV_32FC3);for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++){auto v=src.at<cv::Vec3f>(y,x);float Y=x<src.cols-src.cols%4?std::fma(v[0],.114f,std::fma(v[1],.587f,v[2]*.299f)):std::fma(v[2],.299f,std::fma(v[0],.114f,v[1]*.587f));dst.at<cv::Vec3f>(y,x)=cv::Vec3f(Y,std::fma(v[2]-Y,.713f,.5f),std::fma(v[0]-Y,.564f,.5f));}}
void nativeGray(const cv::Mat& src,cv::Mat& dst){dst.create(src.size(),CV_32F);for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++){auto v=src.at<cv::Vec3f>(y,x);dst.at<float>(y,x)=x<src.cols-src.cols%4?std::fma(v[2],.299f,std::fma(v[1],.587f,v[0]*.114f)):std::fma(v[2],.299f,std::fma(v[0],.114f,v[1]*.587f));}}
void nativeGaussian(const cv::Mat& src,cv::Mat& dst){const cv::Mat kernel=cv::getGaussianKernel(13,1.5,CV_32F);cv::Mat horizontal(src.size(),CV_32F),result(src.size(),CV_32F);for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++){float v=src.at<float>(y,reflect(x-6,src.cols))*kernel.at<float>(0);for(int k=1;k<13;k++)v=std::fma(src.at<float>(y,reflect(x+k-6,src.cols)),kernel.at<float>(k),v);horizontal.at<float>(y,x)=v;}for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++){float v=horizontal.at<float>(y,x)*kernel.at<float>(6);for(int k=1;k<=6;k++)v=std::fma(horizontal.at<float>(reflect(y+k,src.rows),x)+horizontal.at<float>(reflect(y-k,src.rows),x),kernel.at<float>(6+k),v);result.at<float>(y,x)=v;}dst=result;}
#include "sqrt-tables.h"
static float estimateReference(float x,bool rsqrt){
 int exponent;float unit=std::frexp(x,&exponent)*2.f;exponent--;uint32_t bits;std::memcpy(&bits,&unit,4);int index=(bits>>15)&255;int parity=(exponent%2+2)%2;
 bits=rsqrt?(parity?rsqrtEstimateTwo[index]:rsqrtEstimateOne[index]):reciprocalEstimate[index];float estimate;std::memcpy(&estimate,&bits,4);return std::ldexp(estimate,rsqrt?-(exponent-parity)/2:-exponent);
}
static float sqrtCarotene(float value){
 if(value==0)return 0;float e=estimateReference(value,true);for(int i=0;i<2;i++)e=(std::fma(-(e*e),value,3.f)*.5f)*e;
 float inverse=estimateReference(e,false);for(int i=0;i<2;i++)inverse=std::fma(-e,inverse,2.f)*inverse;return inverse;
}
static void nativeMagnitude(const cv::Mat& a,const cv::Mat& b,cv::Mat& out,int imageHeight,int sourceY,int sourceWidth,int sourceX){
 out.create(a.size(),CV_32F);
 // Preserve the native full-width halo matrix's HAL stripe boundaries even
 // when bounded descriptor windows visit only some of its columns.
 const size_t total=size_t(sourceWidth)*a.rows;
 const int stripes=std::max(1,cvRound(total/65536.));
 std::vector<size_t> ends(stripes),vectorEnds(stripes);size_t begin=0;
 for(int stripe=0;stripe<stripes;stripe++){size_t end=(uint64_t(stripe+1)*total+stripes/2)/stripes;ends[stripe]=end;vectorEnds[stripe]=begin+(end-begin)/2*2;begin=end;}
 for(int y=0;y<a.rows;y++){size_t global=size_t(y)*sourceWidth+sourceX;int stripe=std::upper_bound(ends.begin(),ends.end(),global)-ends.begin();
  for(int x=0;x<a.cols;x++,global++){while(global>=ends[stripe])stripe++;const float ax=a.at<float>(y,x),by=b.at<float>(y,x);out.at<float>(y,x)=global<vectorEnds[stripe]?sqrtCarotene(ax*ax+by*by):std::sqrt(std::fma(ax,ax,by*by));}
 }
}
void nativeSobel(const cv::Mat&src,cv::Mat&dst,int axis){cv::Mat horizontal(src.size(),CV_32F);dst.create(src.size(),CV_32F);const int end=src.cols-src.cols%4;for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++){float l=src.at<float>(y,reflect(x-1,src.cols)),r=src.at<float>(y,reflect(x+1,src.cols)),c=src.at<float>(y,x);horizontal.at<float>(y,x)=axis?x<end?((l+r)+c)+c:(l+r)+c*2:r-l;}for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++){float t=horizontal.at<float>(reflect(y-1,src.rows),x),b=horizontal.at<float>(reflect(y+1,src.rows),x),c=horizontal.at<float>(y,x);dst.at<float>(y,x)=(axis?b-t:x<end?((t+b)+c)+c:(t+c*2)+b)*.125f;}}
static int describe_row(const unsigned char* source,const unsigned char* encoded,int width,int height,int offset,int block,int imageHeight,int sourceY,float* content,float* profiles,unsigned char* usable,float* background,bool rawContent,int sourceWidth=0,int sourceX=0,int cellOffset=0,int cellCount=0){
 if(!source||!encoded||!content||!profiles||!usable||!background||width<block||height<offset+block||offset<0||block<16||sourceY<0||imageHeight<sourceY+height)return 0;
 if(!sourceWidth)sourceWidth=width;
 if(!cellCount)cellCount=width/block;
 if(sourceX<0||sourceX+width>sourceWidth||cellOffset<0||cellOffset+cellCount*block>width)return 0;
 try{
 cv::Mat original(height,width,CV_32FC3),compressed(height,width,CV_32FC3);
 for(int y=0;y<height;y++)for(int x=0;x<width;x++)for(int c=0;c<3;c++){original.at<cv::Vec3f>(y,x)[c]=source[(y*width+x)*3+2-c];compressed.at<cv::Vec3f>(y,x)[c]=encoded[(y*width+x)*3+2-c];}
 cv::Mat ycc,gray,coarse,dx,dy,grad,lap,chroma,cg;nativeYcc(original,ycc);std::vector<cv::Mat> channels;cv::split(ycc,channels);gray=channels[0];nativeGaussian(gray,coarse);
 nativeSobel(coarse,dx,0);nativeSobel(coarse,dy,1);nativeMagnitude(dx,dy,grad,imageHeight,sourceY,sourceWidth,sourceX);cv::Laplacian(coarse,lap,CV_32F);lap=cv::abs(lap);
 nativeMagnitude(channels[1]-.5f,channels[2]-.5f,chroma,imageHeight,sourceY,sourceWidth,sourceX);nativeGaussian(chroma,chroma);nativeSobel(chroma,dx,0);nativeSobel(chroma,dy,1);nativeMagnitude(dx,dy,cg,imageHeight,sourceY,sourceWidth,sourceX);
 cv::Mat diff=original-compressed,absolute=cv::abs(diff),levels,residual;nativeGray(absolute,levels);nativeYcc(diff,residual);
 const int cols=cellCount,N=block*block;
 for(int col=0;col<cols;col++){
  std::vector<float> g(N),smooth(N),edge(N),l(N),c(N),ce(N),mid;std::vector<unsigned char> valid(N);std::vector<cv::Vec3f> r(N);
  for(int y=0;y<block;y++)for(int x=0;x<block;x++){int i=y*block+x,xx=cellOffset+col*block+x,yy=offset+y;g[i]=gray.at<float>(yy,xx);smooth[i]=coarse.at<float>(yy,xx);edge[i]=grad.at<float>(yy,xx);l[i]=lap.at<float>(yy,xx);c[i]=chroma.at<float>(yy,xx);ce[i]=cg.at<float>(yy,xx);r[i]=residual.at<cv::Vec3f>(yy,xx);r[i][1]-=.5f;r[i][2]-=.5f;}
  float mean=average(smooth,block);std::vector<float> variance(N);for(int i=0;i<N;i++){float d=smooth[i]-mean;variance[i]=d*d;}
  float* ct=content+col*6;ct[0]=average(g,block);ct[1]=std::sqrt(average(variance,block));ct[2]=average(edge,block);ct[3]=average(l,block);ct[4]=average(c,block);ct[5]=average(ce,block);if(!rawContent)for(int d: {1,2,3,5})ct[d]=std::log1p(ct[d]);
  auto ordered=edge;std::sort(ordered.begin(),ordered.end());double rank=(N-1)*.7;int lo=std::floor(rank);double fraction=rank-lo,delta=(double)ordered[std::min(lo+1,N-1)]-ordered[lo];double cut=fraction>=.5?ordered[std::min(lo+1,N-1)]-delta*(1-fraction):ordered[lo]+delta*fraction;
  int count=0;float energy[3]={0,0,0};for(int y=0;y<block;y++)for(int x=0;x<block;x++){int i=y*block+x;valid[i]=(g[i]>3&&g[i]<252&&edge[i]<=cut);count+=valid[i];for(int d=0;d<3;d++){float v=r[i][d]*r[i][d];energy[d]+=v*valid[i];}if(valid[i])mid.push_back(levels.at<float>(offset+y,cellOffset+col*block+x));}
  usable[col]=count>=N*.35;for(int d=0;d<3;d++)profiles[col*5+d]=std::log1p(std::sqrt((double)energy[d]/std::max(count,1)));
  for(int lag=1;lag<=2;lag++){
   std::vector<float>a,b,av,bv;std::vector<unsigned char>v;
   for(int axis=0;axis<2;axis++)for(int y=0;y<block-(axis?lag:0);y++)for(int x=0;x<block-(axis?0:lag);x++){int i=y*block+x,j=i+(axis?lag*block:lag);a.push_back(std::abs(r[j][0]));b.push_back(std::abs(r[i][0]));v.push_back(valid[i]&&valid[j]);}
   int nn=0;for(unsigned char x:v)nn+=x;av.resize(a.size());bv.resize(a.size());for(size_t i=0;i<a.size();i++){av[i]=a[i]*v[i];bv[i]=b[i]*v[i];}double ma=(double)sum(av,0,av.size())/std::max(nn,1),mb=(double)sum(bv,0,bv.size())/std::max(nn,1);std::vector<double>ab(a.size()),aa(a.size()),bb(a.size());
   for(size_t i=0;i<a.size();i++){double da=a[i]-ma,db=b[i]-mb;ab[i]=(da*db)*v[i];aa[i]=(da*da)*v[i];bb[i]=(db*db)*v[i];}double denom=std::sqrt(sum(aa,0,aa.size())*sum(bb,0,bb.size()));profiles[col*5+2+lag]=denom>1e-6?sum(ab,0,ab.size())/denom:0;
  }
  if(mid.empty()){for(int j=0;j<3;j++)background[col*3+j]=0;}else{
   std::sort(mid.begin(),mid.end());int start=std::floor(count*.1),end=std::ceil(count*.9);std::vector<float> trimmed(N,0);for(int i=start;i<end;i++)trimmed[i]=mid[i];double m=(double)sum(trimmed,0,N)/std::max(end-start,1);background[col*3]=std::log1p(m);background[col*3+1]=std::log1p((double)mid[(int)std::floor((count-1)*.25)]);background[col*3+2]=std::log1p((double)mid[(int)std::floor((count-1)*.75)]);
  }
 }
 return 1;
 }catch(...){return 0;}
}

extern "C" int ela_describe_row(const unsigned char* source,const unsigned char* encoded,int width,int height,int offset,int block,int imageHeight,int sourceY,float* content,float* profiles,unsigned char* usable,float* background){return describe_row(source,encoded,width,height,offset,block,imageHeight,sourceY,content,profiles,usable,background,false);}

extern "C" int ela_describe_unlogged(const unsigned char* source,const unsigned char* encoded,int width,int height,int offset,int block,int imageHeight,int sourceY,float* content,float* profiles,unsigned char* usable,float* background){return describe_row(source,encoded,width,height,offset,block,imageHeight,sourceY,content,profiles,usable,background,true);}

extern "C" int ela_describe_window(const unsigned char* source,const unsigned char* encoded,int width,int height,int offset,int block,int imageHeight,int sourceY,int sourceWidth,int sourceX,int cellOffset,int cellCount,float* content,float* profiles,unsigned char* usable,float* background){return describe_row(source,encoded,width,height,offset,block,imageHeight,sourceY,content,profiles,usable,background,true,sourceWidth,sourceX,cellOffset,cellCount);}
