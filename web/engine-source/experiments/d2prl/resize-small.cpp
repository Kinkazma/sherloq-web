// Arithmetic candidates for the native four-neighbour, small-output path.
// Offline qualification only; mode is never a user/runtime calibration option.
#include <cmath>
#include <algorithm>
#include "resize.cpp"
extern "C" int d2prl_resize_small_probe(const float* input,int channels,int ih,int iw,int oh,int ow,int mode,float* output){
 if(channels<1||channels>2048||ih<2||iw<2||oh<2||ow<2||oh+ow>128||mode<0||mode>4)return 0;
 const float sx=float(iw-1)/float(ow-1),sy=float(ih-1)/float(oh-1);
 for(int c=0;c<channels;c++)for(int y=0;y<oh;y++)for(int x=0;x<ow;x++){
  const float fy=sy*y,fx=sx*x;const int y0=std::min(int(fy),ih-1),x0=std::min(int(fx),iw-1),y1=std::min(y0+1,ih-1),x1=std::min(x0+1,iw-1);
  const float ly=std::clamp(fy-y0,0.f,1.f),lx=std::clamp(fx-x0,0.f,1.f),hy=1.f-ly,hx=1.f-lx;
  const float w0=hy*hx,w1=hy*lx,w2=ly*hx,w3=ly*lx,*p=input+c*ih*iw;
  const float a=p[y0*iw+x0],b=p[y0*iw+x1],d=p[y1*iw+x0],e=p[y1*iw+x1];float value;
  if(mode==0){value=a*w0;value=std::fma(b,w1,value);value=std::fma(d,w2,value);value=std::fma(e,w3,value);}
  else if(mode==1){value=e*w3;value=std::fma(d,w2,value);value=std::fma(b,w1,value);value=std::fma(a,w0,value);}
  else if(mode==2)value=((a*w0+b*w1)+d*w2)+e*w3;
  else if(mode==3)value=a*w0+(b*w1+(d*w2+e*w3));
  else {value=std::fma(a,w0,b*w1);value=std::fma(d,w2,value);value=std::fma(e,w3,value);}
  output[(c*oh+y)*ow+x]=value;
 }return 1;
}
extern "C" int d2prl_resize_reference(const float* input,int channels,int ih,int iw,int oh,int ow,float* output){
 if(oh+ow>128)return d2prl_resize_large(input,channels,ih,iw,oh,ow,output);
 if(channels<1||channels>2048||ih<2||iw<2||ih>1024||iw>1024||oh<2||ow<2)return 0;
 const int vector=channels-channels%4;
 if(vector&&!d2prl_resize_small_probe(input,vector,ih,iw,oh,ow,3,output))return 0;
 if(vector<channels&&!d2prl_resize_small_probe(input+vector*ih*iw,channels-vector,ih,iw,oh,ow,4,output+vector*oh*ow))return 0;
 return 1;
}
