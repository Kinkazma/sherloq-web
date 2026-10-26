// RGB-byte -> NCHW float32 -> released non-AA bilinear D2PRL preparation.
// Historical AA exports remain available for archived component studies.
// Separable coefficient rules follow PyTorch2.8 UpSampleKernel.cpp (BSD notice
// retained in this directory). Native source pixels/bytes remain caller-owned.
#include <algorithm>
#include <cmath>
#include <cstdint>
extern "C" int d2prl_rgb_normalize(const uint8_t* input,int pixels,int begin,int end,float* output){
 if(pixels<1||pixels>32*1024*1024||begin<0||end<begin||end>pixels)return 0;
 for(int p=begin;p<end;p++)for(int c=0;c<3;c++)output[c*pixels+p]=float(input[p*3+c])/255.f;
 return 1;
}
extern "C" int d2prl_aa_coefficients(int input,int output,int* starts,int* counts,float* weights){
 if(input<1||input>131072||output<1||output>448)return 0;
 const float scale=float(input)/float(output),support=scale>=1.f?scale:1.f;
 const int stride=int(std::ceil(support))*2+1;
 const float invscale=scale>=1.f?float(1.0/double(scale)):1.f;
 for(int i=0;i<output;i++){
  const float center=float(double(scale)*(double(i)+0.5));
  const int first=std::max(int(double(center-support)+0.5),0);
  const int count=std::clamp(std::min(int(double(center+support)+0.5),input)-first,0,stride);
  starts[i]=first;counts[i]=count;float total=0;
  for(int j=0;j<count;j++){
   const float delta=float(j+first)-center;
   const float x=std::abs(float((double(delta)+0.5)*double(invscale)));
   const float w=x<1.f?float(1.0-double(x)):0.f;weights[i*stride+j]=w;total+=w;
  }
  if(total!=0.f)for(int j=0;j<count;j++)weights[i*stride+j]/=total;
  for(int j=count;j<stride;j++)weights[i*stride+j]=0.f;
 }return stride;
}
extern "C" int d2prl_aa_rows(const float* input,int channels,int height,int width,int output_size,int axis,int begin,int end,const int* starts,const int* counts,const float* weights,int weight_stride,int fused,float* output){
 if(channels<1||channels>3||height<1||height>131072||width<1||width>131072||output_size<1||output_size>448||(axis!=0&&axis!=1)||begin<0||end<begin||weight_stride<3)return 0;
 const int oh=axis==0?output_size:height,ow=axis==1?output_size:width;
 if(end>channels*oh)return 0;
 for(int row=begin;row<end;row++){
  const int c=row/oh,y=row%oh;
  for(int x=0;x<ow;x++){
   const int coord=axis==0?y:x,first=starts[coord],count=counts[coord];if(count<1||count>weight_stride)return 0;
   const int source=(c*height+(axis==0?first:y))*width+(axis==1?first:x),step=axis==0?width:1;
   float value=input[source]*weights[coord*weight_stride];
   for(int j=1;j<count;j++){const float v=input[source+j*step],w=weights[coord*weight_stride+j];if(fused)value=std::fma(v,w,value);else{const float product=v*w;value+=product;}}
   output[row*ow+x]=value;
  }
 }return 1;
}

// Released torchvision0.11 Tensor Resize: bilinear, align_corners=False,
// antialias=False. A bounded source band contains both native neighbors.
extern "C" int d2prl_noaa_rows(const float* input,int channels,int ih,int iw,int oh,int ow,int begin,int end,int source_y,int source_rows,float* output){
 if(!input||!output||channels!=3||ih<1||iw<1||ih>131072||iw>131072||oh!=448||ow!=448||begin<0||end<begin||end>oh||source_y<0||source_rows<1||source_y+source_rows>ih)return 0;
 const float sy=float(ih)/float(oh),sx=float(iw)/float(ow);
 for(int y=begin;y<end;y++){
  const float fy=ih==oh?float(y):std::max(0.f,std::fma(sy,float(y)+.5f,-.5f));
  const int y0=std::min(int(std::floor(fy)),ih-1),y1=ih==oh?y0:std::min(y0+1,ih-1);
  if(y0<source_y||y1>=source_y+source_rows)return 0;
  const float ly=ih==oh?0.f:std::clamp(fy-float(y0),0.f,1.f),hy=1.f-ly;
  for(int c=0;c<channels;c++)for(int x=0;x<ow;x++){
   const float fx=iw==ow?float(x):std::max(0.f,std::fma(sx,float(x)+.5f,-.5f));
   const int x0=std::min(int(std::floor(fx)),iw-1),x1=iw==ow?x0:std::min(x0+1,iw-1);
   const float lx=iw==ow?0.f:std::clamp(fx-float(x0),0.f,1.f),hx=1.f-lx;
   const float* a=input+c*source_rows*iw;
   const float top=std::fma(a[(y0-source_y)*iw+x0],hx,a[(y0-source_y)*iw+x1]*lx);
   const float bottom=std::fma(a[(y1-source_y)*iw+x0],hx,a[(y1-source_y)*iw+x1]*lx);
   output[(c*oh+y)*ow+x]=std::fma(top,hy,bottom*ly);
  }
 }return 1;
}
