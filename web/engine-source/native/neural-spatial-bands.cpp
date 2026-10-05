// Bounded rows of the qualified OpenCV4.11 native float32 projection.
// Global coordinates, inverse-scale evaluation and vector/scalar arithmetic
// boundaries match experiments/d2prl/spatial.cpp (selected mode4).
#include <algorithm>
#include <cmath>
#include <vector>
extern "C" int neural_spatial_rows(const float* input,int width,int height,int out_width,int out_height,int first_row,int rows,int nearest,float* output){
 if(!input||!output||width<1||height<1||width>512||height>512||out_width<1||out_height<1||out_width>131072||out_height>131072||first_row<0||rows<1||rows>out_height-first_row||(nearest!=0&&nearest!=1))return 0;
 for(int i=0;i<width*height;i++)if(!std::isfinite(input[i]))return 0;
 const double sx=1./((double)out_width/width),sy=1./((double)out_height/height);
 if(nearest){
  for(int y=first_row;y<first_row+rows;y++){const int yy=std::min((int)std::floor(y*sy),height-1);for(int x=0;x<out_width;x++)output[(y-first_row)*out_width+x]=input[yy*width+std::min((int)std::floor(x*sx),width-1)];}return 1;
 }
 if(width==out_width&&height==out_height){std::copy(input+first_row*width,input+(first_row+rows)*width,output);return 1;}
 if(width==2*out_width&&height==2*out_height){
  for(int y=first_row;y<first_row+rows;y++)for(int x=0;x<out_width;x++){const float*a=input+2*y*width+2*x,*b=a+width;const float sum=x<(out_width/4)*4?(a[0]+a[1])+(b[0]+b[1]):((a[0]+a[1])+b[0])+b[1];output[(y-first_row)*out_width+x]=sum*.25f;}return 1;
 }
 int xmax=out_width;std::vector<int> xs(out_width);std::vector<float> alpha(out_width);
 for(int x=0;x<out_width;x++){float f=(float)((x+.5)*sx-.5);int k=(int)std::floor(f);f-=k;if(k<0){k=0;f=0;}if(k>=width-1){k=width-1;f=0;xmax=std::min(xmax,x);}xs[x]=k;alpha[x]=f;}
 for(int y=first_row;y<first_row+rows;y++){float f=(float)((y+.5)*sy-.5);int k=(int)std::floor(f);f-=k;const float b0=1.f-f,b1=f;const int y0=std::clamp(k,0,height-1),y1=std::clamp(k+1,0,height-1);
  for(int x=0;x<out_width;x++){const int x0=xs[x],x1=std::min(width-1,x0+1);const float a1=alpha[x],a0=1.f-a1;auto horizontal=[&](int yy){const float l=input[yy*width+x0],r=input[yy*width+x1];if(x>=xmax)return l;if(x>=(xmax/4)*4)return std::fma(l,a0,r*a1);return l*a0+r*a1;};const float t0=horizontal(y0),t1=horizontal(y1);output[(y-first_row)*out_width+x]=std::fma(t0,b0,t1*b1);}
 }return 1;
}
