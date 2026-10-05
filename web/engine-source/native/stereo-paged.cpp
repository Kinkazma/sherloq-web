#include "stereo-paged-mat.h"
#include <opencv2/imgproc.hpp>
#include <cmath>
#include <cfloat>
#include <cstring>
#include "stereo-fma.h"
#include "stereo-gaussian-simd.h"
EM_ASYNC_JS(int,allocateStore,(double bytes),{try{return await Module.allocate(bytes);}catch(e){Module.ioError=e;return -1;}});
EM_ASYNC_JS(int,dropStore,(int id),{try{await Module.drop(id);return 0;}catch(e){Module.ioError=e;return 1;}});
EM_ASYNC_JS(int,transferStore,(int id,double offset,int length,void* pointer,int write),{try{await Module.transfer(id,offset,length,pointer,write);return 0;}catch(e){Module.ioError=e;return 1;}});
EM_ASYNC_JS(int,checkpointStore,(int row,int total),{try{await Module.checkpoint(row,total);return 0;}catch(e){Module.ioError=e;return 1;}});
EM_ASYNC_JS(int,sourceRows,(int y,int h,int pointer),{try{await Module.sourceRows(y,h,pointer);return 0;}catch(e){Module.ioError=e;return 1;}});
EM_ASYNC_JS(int,outputRow,(int y,int width,int pointer),{try{await Module.outputRow(y,width,pointer);return 0;}catch(e){Module.ioError=e;return 1;}});
extern "C" int stereoPagedAllocate(double bytes){int id=allocateStore(bytes);if(id<0)throw std::runtime_error("Paged allocation failed");return id;}
extern "C" void stereoPagedDrop(int id){if(dropStore(id))throw std::runtime_error("Paged disposal failed");}
extern "C" void stereoPagedTransfer(int id,double offset,int length,void* pointer,int write){if(transferStore(id,offset,length,pointer,write))throw std::runtime_error("Paged transfer failed");}
extern "C" void stereoPagedCheck(int row,int total){if(checkpointStore(row,total))throw std::runtime_error("Paged operation cancelled");}
EM_JS(void,stage,(int phase,int level,int iteration),{Module.stage={phase:['input','resize-flow','gaussian','resize-image','polynomial','matrices','iterate','output'][phase],level,iteration};});
using cv::PagedMat;
static void resize(const PagedMat& input,PagedMat& output,int w,int h){
 const int cn=input.channels(),iw=input.cols,ih=input.rows;output.create(h,w,input.type());
 if(iw==w&&ih==h){for(int y=0;y<h;y++){std::copy_n(input.ptr<float>(y),w*cn,output.ptr<float>(y));stereoPagedCheck(y,h);}return;}
 if(iw==w*2&&ih==h*2&&cn==1){for(int y=0;y<h;y++){const float*a=input.ptr<float>(y*2),*b=input.ptr<float>(y*2+1);float*out=output.ptr<float>(y);for(int x=0;x<w;x++)out[x]=x<w/4*4?((a[x*2]+a[x*2+1])+(b[x*2]+b[x*2+1]))*.25f:(a[x*2]+a[x*2+1]+b[x*2]+b[x*2+1])*.25f;stereoPagedCheck(y,h);}return;}
 const double scaleX=1./(double(w)/iw),scaleY=1./(double(h)/ih);int xmax=w;std::vector<int> offsets(w);std::vector<float> weights(w);
 for(int x=0;x<w;x++){float fx=std::fma(x+.5,scaleX,-.5);int sx=cvFloor(fx);fx-=sx;if(sx<0){fx=0;sx=0;}if(sx+1>=iw){xmax=std::min(xmax,x);fx=0;sx=iw-1;}offsets[x]=sx;weights[x]=fx;}
 const int vectorEnd=xmax*cn/4*4;std::vector<float> a(w*cn),b(w*cn);int ay=-1,by=-1;
 auto horizontal=[&](int y,std::vector<float>&v){const float*src=input.ptr<float>(y);for(int x=0;x<w;x++)for(int c=0;c<cn;c++){const int at=x*cn+c,sx=offsets[x];float left=src[sx*cn+c],fx=weights[x];v[at]=x>=xmax?left:at<vectorEnd?left*(1-fx)+src[(sx+1)*cn+c]*fx:sherloq_stereo_fma(left,1-fx,src[(sx+1)*cn+c]*fx);}};
 for(int y=0;y<h;y++){float fy=std::fma(y+.5,scaleY,-.5);int sy=cvFloor(fy);fy-=sy;int top=std::clamp(sy,0,ih-1),bottom=std::clamp(sy+1,0,ih-1);if(top==by){a.swap(b);std::swap(ay,by);}if(ay!=top){horizontal(top,a);ay=top;}if(by!=bottom){horizontal(bottom,b);by=bottom;}float*out=output.ptr<float>(y);for(int x=0;x<w*cn;x++)out[x]=sherloq_stereo_fma(a[x],1-fy,b[x]*fy);stereoPagedCheck(y,h);}
}
static void gaussian(const PagedMat&input,PagedMat&output,int size,double sigma){
 const int w=input.cols,h=input.rows,r=size/2;cv::Mat kernel=cv::getGaussianKernel(size,sigma,CV_32F);const float*k=kernel.ptr<float>();PagedMat horizontal;horizontal.create(h,w,CV_32F);output.create(h,w,CV_32F);
 std::vector<float> padded(w+2*r);
 for(int y=0;y<h;y++){const float*src=input.ptr<float>(y);float*dst=horizontal.ptr<float>(y);auto at=[&](int x){return src[cv::borderInterpolate(x,w,cv::BORDER_REFLECT_101)];};
  if(size<=5){for(int x=0;x<w;x++){float sum=w%2&&x==w-1?sherloq_stereo_fma(at(x-1)+at(x+1),k[r+1],src[x]*k[r]):sherloq_stereo_fma(src[x],k[r],(at(x-1)+at(x+1))*k[r+1]);if(r==2)sum=sherloq_stereo_fma(at(x-2)+at(x+2),k[r+2],sum);dst[x]=sum;}}
  else{for(int x=-r;x<w+r;x++)padded[x+r]=at(x);for(int x=0;x<w;x++)dst[x]=padded[x]*k[0];for(int j=1;j<size;j++)stereoGaussianAccumulate<false>(dst,padded.data()+j,nullptr,k[j],w);}stereoPagedCheck(y,h*2);
 }
 const PagedMat& horizontalRead=horizontal;
 for(int y=0;y<h;y++){float*dst=output.ptr<float>(y);const float*center=horizontalRead.ptr<float>(y);for(int x=0;x<w;x++)dst[x]=center[x]*k[r];for(int j=1;j<=r;j++){const float*a=horizontalRead.ptr<float>(cv::borderInterpolate(y-j,h,cv::BORDER_REFLECT_101)),*b=horizontalRead.ptr<float>(cv::borderInterpolate(y+j,h,cv::BORDER_REFLECT_101));stereoGaussianAccumulate<true>(dst,a,b,k[r+j],w);}stereoPagedCheck(y+h,h*2);}horizontal.release();
}
extern "C" int stereo_paged_flow(int sourceWidth,int height,int offset,int original,char*error){
 try{if(sourceWidth<=offset||offset<1||height<1)throw std::runtime_error("Invalid stereo dimensions");stereoFastArithmetic=!original;int width=sourceWidth-offset;PagedMat gray[2],blurred,small,R[2],M,flows[2];gray[0].create(height,width,CV_32F);gray[1].create(height,width,CV_32F);stage(0,0,0);
 const int rows=std::max(1,65536/sourceWidth);std::vector<unsigned char> rgb(size_t(rows)*sourceWidth*3);
 for(int y=0;y<height;y+=rows){int h=std::min(rows,height-y);if(sourceRows(y,h,reinterpret_cast<intptr_t>(rgb.data())))throw std::runtime_error("Source read failed");cv::Mat input(h,sourceWidth,CV_8UC3,rgb.data()),g;cv::cvtColor(input,g,cv::COLOR_RGB2GRAY);for(int yy=0;yy<h;yy++){const auto*in=g.ptr<unsigned char>(yy);float*a=gray[0].ptr<float>(y+yy),*b=gray[1].ptr<float>(y+yy);for(int x=0;x<width;x++){a[x]=in[x+offset];b[x]=in[x];}}stereoPagedCheck(y+h,height);}
 int levels=0;double scale=1;for(;levels<5;levels++){scale*=.5;if(width*scale<32||height*scale<32)break;}
 PagedMat*previous=nullptr;PagedMat*flow=nullptr;
 for(int level=levels;level>=0;level--){scale=std::ldexp(1.,-level);int w=cvRound(width*scale),h=cvRound(height*scale),smooth=std::max(cvRound((1./scale-1)*.5*5)|1,3);flow=&flows[(levels-level)%2];flow->create(h,w,CV_32FC2);stage(1,level,0);if(previous){resize(*previous,*flow,w,h);for(int y=0;y<h;y++){float*p=flow->ptr<float>(y);for(int x=0;x<w*2;x++)p[x]*=2.f;}previous->release();}else flow->zero();
  for(int side=0;side<2;side++){stage(2,level,side);gaussian(gray[side],blurred,smooth,(1./scale-1)*.5);stage(3,level,side);resize(blurred,small,w,h);blurred.release();stage(4,level,side);cv::FarnebackPolyExp(small,R[side],5,1.2);small.release();}
  stage(5,level,0);cv::FarnebackUpdateMatrices(R[0],R[1],*flow,M,0,h);for(int iteration=0;iteration<5;iteration++){stage(6,level,iteration);cv::FarnebackUpdateFlow_GaussianBlur(R[0],R[1],*flow,M,15,iteration<4);}R[0].release();R[1].release();M.release();previous=flow;
 }
 stage(7,0,0);std::vector<float> row(width);const PagedMat&read=*flow;for(int y=0;y<height;y++){const float*in=read.ptr<float>(y);for(int x=0;x<width;x++)row[x]=in[x*2];if(outputRow(y,width,reinterpret_cast<intptr_t>(row.data())))throw std::runtime_error("Output write failed");stereoPagedCheck(y+1,height);}flow->release();gray[0].release();gray[1].release();return 0;
 }catch(const std::exception&e){std::strncpy(error,e.what(),1023);error[1023]=0;return 1;}catch(...){std::strcpy(error,"Paged Farneback failure");return 1;}
}
