// Native CM2 polygon eligibility and float32 texture semantics. GPL-3.0-or-later.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <cmath>
#include <cstring>
#include <stdexcept>
#include <vector>
extern "C" int sherloq_dense_allowed(const unsigned char* rgb,int width,int height,
 int dw,int dh,double shift,int patch,float texture,const double* points,
 const int* polygons,int count,int regions,unsigned char* out,char* error){
 try{
  if(width<=0||height<=0||dw<=0||dh<=0||shift<0||std::nearbyint(shift+dw-1)>=width||std::nearbyint(shift+dh-1)>=height||patch<2||patch>32||count<0||regions<0||regions>2||regions>count)throw std::runtime_error("Invalid dense mask geometry");
  std::fill(out,out+size_t(dw)*dh,regions?0:1);
  cv::Mat mask(height,width,CV_8U);
  for(int p=0;p<count;++p){
   mask.setTo(0);const int first=polygons[2*p],length=polygons[2*p+1];std::vector<cv::Point> xy;
   for(int i=0;i<length;++i)xy.emplace_back(int(std::nearbyint(points[2*(first+i)])),int(std::nearbyint(points[2*(first+i)+1])));
   std::vector<std::vector<cv::Point>> paths{xy};cv::fillPoly(mask,paths,cv::Scalar(255));
   for(int y=0;y<dh;++y)for(int x=0;x<dw;++x){
    if(mask.at<unsigned char>(int(std::nearbyint(y+shift)),int(std::nearbyint(x+shift)))){
     if(p<regions)out[size_t(y)*dw+x]|=1<<p;else out[size_t(y)*dw+x]=0;
    }
   }
  }
  if(texture>0){
   cv::Mat gray(height,width,CV_32F),squared(height,width,CV_32F),average,power;
   for(size_t i=0;i<size_t(width)*height;++i){float v=float(int(rgb[3*i])+rgb[3*i+1]+rgb[3*i+2])/3.f;gray.ptr<float>()[i]=v;squared.ptr<float>()[i]=v*v;}
   cv::boxFilter(gray,average,-1,cv::Size(2*patch+1,2*patch+1));
   cv::boxFilter(squared,power,-1,cv::Size(2*patch+1,2*patch+1));
   for(int y=0;y<dh;++y)for(int x=0;x<dw;++x){
    const int yy=int(std::nearbyint(y+shift)),xx=int(std::nearbyint(x+shift));
    float mean=average.at<float>(yy,xx),v=power.at<float>(yy,xx)-mean*mean;
    if(std::sqrt(std::max(v,0.f))<texture)out[size_t(y)*dw+x]=0;
   }
  }
  return 0;
 }catch(const std::exception& e){std::strncpy(error,e.what(),1023);error[1023]=0;return -1;}
}

extern "C" int sherloq_dense_detail(const unsigned char* rgb,int width,int height,float* out){
 try{
  cv::Mat image(height,width,CV_8UC3,const_cast<unsigned char*>(rgb)),gray;cv::cvtColor(image,gray,cv::COLOR_RGB2GRAY);
  const int radius=5;auto kernel=cv::getGaussianKernel(11,1.2,CV_32F);const float* k=kernel.ptr<float>();cv::Mat horizontal(height,width,CV_32F);
  for(int y=0;y<height;y++)for(int x=0;x<width;x++){
   float sum=gray.at<unsigned char>(y,cv::borderInterpolate(x-radius,width,cv::BORDER_REFLECT_101))*k[0];
   for(int j=1;j<11;j++)sum=std::fma(float(gray.at<unsigned char>(y,cv::borderInterpolate(x+j-radius,width,cv::BORDER_REFLECT_101))),k[j],sum);
   horizontal.at<float>(y,x)=sum;
  }
  for(int y=0;y<height;y++)for(int x=0;x<width;x++){
   float sum=horizontal.at<float>(y,x)*k[radius];
   for(int j=1;j<=radius;j++){float pair=horizontal.at<float>(cv::borderInterpolate(y-j,height,cv::BORDER_REFLECT_101),x)+horizontal.at<float>(cv::borderInterpolate(y+j,height,cv::BORDER_REFLECT_101),x);sum=std::fma(pair,k[radius+j],sum);}
   out[y*width+x]=gray.at<unsigned char>(y,x)-sum;
  }return 1;
 }catch(...){return 0;}
}
extern "C" int sherloq_dense_remap(const float* image,int width,int height,const float* x,const float* y,int rows,int cols,float* out){
 try{
  for(int i=0;i<rows*cols;i++){
   int ix=int(std::nearbyint(x[i]*32.f)),iy=int(std::nearbyint(y[i]*32.f));float fx=(ix&31)/32.f,fy=(iy&31)/32.f;ix>>=5;iy>>=5;
   const float weights[]={(1-fy)*(1-fx),(1-fy)*fx,fy*(1-fx),fy*fx};float samples[4];
   for(int j=0;j<4;j++){int sx=ix+(j&1),sy=iy+(j>>1);samples[j]=sx>=0&&sx<width&&sy>=0&&sy<height?image[sy*width+sx]:0.f;}
   float sum=std::fma(samples[0],weights[0],samples[1]*weights[1]);for(int j=2;j<4;j++)sum=std::fma(samples[j],weights[j],sum);out[i]=sum;
  }return 1;
 }catch(...){return 0;}
}
extern "C" int sherloq_dense_guide_labels(const float* points,int n,int width,int height,const double* vertices,const int* polygons,int count,int* labels){
 try{
  std::fill(labels,labels+n,-1);cv::Mat mask(height,width,CV_8U);
  for(int k=0;k<count;k++){
   mask.setTo(0);std::vector<cv::Point> xy;for(int i=0;i<polygons[2*k+1];i++){int at=polygons[2*k]+i;xy.emplace_back(int(std::nearbyint(vertices[2*at])),int(std::nearbyint(vertices[2*at+1])));}cv::fillPoly(mask,std::vector<std::vector<cv::Point>>{xy},cv::Scalar(255));
   for(int i=0;i<n;i++){int x=std::max(0,std::min(width-1,int(std::nearbyint(points[i*7])))),y=std::max(0,std::min(height-1,int(std::nearbyint(points[i*7+1]))));if(mask.at<unsigned char>(y,x))labels[i]=labels[i]==-1?k:-2;}
  }for(int i=0;i<n;i++)if(labels[i]<0)labels[i]=-1;return 1;
 }catch(...){return 0;}
}

// Presentation follows core/cloning2.py with Float32 dense orientation arithmetic.
extern "C" {
double sherloq_dense_overlap(const float* a,const float* b,int count) {
 if(!a||!b||count<1||count>100000)return -1;
 try {
  cv::Mat pa(count,1,CV_32FC2,const_cast<float*>(a)),pb(count,1,CV_32FC2,const_cast<float*>(b));
  std::vector<cv::Point2f> ha,hb,intersection;cv::convexHull(pa,ha);cv::convexHull(pb,hb);
  double area=std::min(cv::contourArea(ha),cv::contourArea(hb));
  if(area<=0)return 0;
  return std::max(0.,std::min(1.,cv::intersectConvexConvex(ha,hb,intersection,true)/area));
 }catch(...){return -1;}
}
int sherloq_dense_draw_group(unsigned char* rgb,int width,int height,const float* points,const double* pairs,const uint32_t* rows,int count,const unsigned char* colors,const unsigned char* base,int flags){
 if(!rgb||width<1||height<1||!points||!pairs||!rows||count<1||count>100000||!colors||!base)return 0;
 try{
  cv::Mat output(height,width,CV_8UC3,rgb);cv::Scalar family(base[2],base[1],base[0]);
  if(flags&8){
   std::vector<cv::Point2f> a,b;a.reserve(count);b.reserve(count);
   for(int i=0;i<count;i++){int ia=int(pairs[rows[i]*4]),ib=int(pairs[rows[i]*4+1]);a.emplace_back(points[ia*7],points[ia*7+1]);b.emplace_back(points[ib*7],points[ib*7+1]);}
   auto norm=[](cv::Point2f p){return std::sqrt(p.x*p.x+p.y*p.y);};const auto ref=a[0],other=b[0];
   for(int i=0;i<count;i++)if(norm(a[i]-ref)+norm(b[i]-other)>norm(a[i]-other)+norm(b[i]-ref))std::swap(a[i],b[i]);
   for(const auto& side:{a,b}){
    std::vector<cv::Point> rounded;std::vector<cv::Point2f> unique=side;std::sort(unique.begin(),unique.end(),[](auto a,auto b){return a.x<b.x||(a.x==b.x&&a.y<b.y);});unique.erase(std::unique(unique.begin(),unique.end()),unique.end());if(unique.size()<3)continue;
    for(auto p:side)rounded.emplace_back(cvRound(p.x),cvRound(p.y));std::vector<cv::Point> hull;cv::convexHull(rounded,hull);const auto rect=cv::boundingRect(hull);
    if(rect.x<0||rect.y<0||rect.x+rect.width>width||rect.y+rect.height>height)return 0;
    cv::Mat roi=output(rect),overlay=roi.clone();std::vector<cv::Point> local=hull;for(auto& p:local)p-=rect.tl();cv::fillConvexPoly(overlay,local,family,cv::LINE_AA);
    cv::addWeighted(overlay,.28,roi,.72,0,roi);cv::polylines(output,hull,true,family,2,cv::LINE_AA);
   }
  }
  for(int i=0;i<count;i++){
   int row=rows[i],ia=int(pairs[row*4]),ib=int(pairs[row*4+1]);cv::Point a(cvRound(points[ia*7]),cvRound(points[ia*7+1])),b(cvRound(points[ib*7]),cvRound(points[ib*7+1]));cv::Scalar color(colors[row*3+2],colors[row*3+1],colors[row*3]);
   if(flags&2)cv::line(output,a,b,color,1,cv::LINE_AA);
   if(flags&1){cv::circle(output,a,std::max(2,cvRound(points[ia*7+2]/2)),color,1,cv::LINE_AA);cv::circle(output,b,std::max(2,cvRound(points[ib*7+2]/2)),color,1,cv::LINE_AA);}
   if(flags&4){cv::circle(output,a,2,color,-1,cv::LINE_AA);cv::circle(output,b,2,color,-1,cv::LINE_AA);}
  }return 1;
 }catch(...){return 0;}
}

}
