// D2PRL released post_1c/post_3c on the model grid, OpenCV4.11 filter2D.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <cmath>
#include <vector>
#include <cstdint>
static void components(std::vector<uint8_t>& mask,int w,int h,int minimum){
 if(minimum<=1)return;const int n=w*h;std::vector<uint8_t> seen(n,0);std::vector<int> queue;queue.reserve(n);
 for(int i=0;i<n;i++)if(mask[i]&&!seen[i]){queue.clear();queue.push_back(i);seen[i]=1;for(size_t at=0;at<queue.size();at++){const int p=queue[at],x=p%w,y=p/w;const int neighbors[4]={x>0?p-1:-1,x+1<w?p+1:-1,y>0?p-w:-1,y+1<h?p+w:-1};for(int q:neighbors)if(q>=0&&mask[q]&&!seen[q]){seen[q]=1;queue.push_back(q);}}if(queue.size()<(size_t)minimum)for(int q:queue)mask[q]=0;}
}
extern "C" int d2prl_postprocess(const float* raw,int w,int h,int minimum,float* output,float* trace){
 if(!raw||!output||w<1||h<1||w>448||h>448||minimum<0||minimum>448*448)return 0;const int n=w*h;
 for(int i=0;i<3*n;i++)if(!std::isfinite(raw[i]))return 0;
 try{
  std::vector<uint8_t> mask(n),both(n);for(int i=0;i<n;i++){mask[i]=raw[i]>.5f;both[i]=raw[n+i]>0||raw[2*n+i]>0;}components(mask,w,h,minimum);components(both,w,h,minimum);
  cv::Mat signed_roles(h,w,CV_32F);for(int i=0;i<n;i++)signed_roles.ptr<float>()[i]=both[i]?(raw[n+i]>0?1.0f:-1.0f):0.0f;
  cv::Mat filtered;cv::filter2D(signed_roles,filtered,-1,cv::Mat::ones(50,50,CV_64F),cv::Point(-1,-1),0,cv::BORDER_CONSTANT);
  for(int i=0;i<n;i++){const float value=filtered.ptr<float>()[i];output[i]=mask[i];output[n+i]=both[i]&&value>0;output[2*n+i]=both[i]&&!(value>0);if(trace)trace[i]=value;}return 1;
 }catch(...){return 0;}
}
