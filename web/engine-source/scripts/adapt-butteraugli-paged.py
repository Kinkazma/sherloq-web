from pathlib import Path
import os
root=Path.cwd();base=Path(os.environ.get('COMPARISON_BASE',root));
def source(name):
 p=root/name
 return p if p.exists() else base/name
out=root/'vendor/comparison-butteraugli-paged-source';out.mkdir(exist_ok=True)
h=source('vendor/comparison/butteraugli/butteraugli.h').read_text();h=h.replace('#include <vector>','#include <vector>\n#include "comparison-paged-plane.h"')
a=h.index('template <typename ComponentType>\nclass Image {');b=h.index('// Returns newly allocated planes',a)
h=h[:a]+'''template <typename ComponentType> class Image {
 using Plane=ComparisonPlane<ComponentType,16,4>;
 std::unique_ptr<Plane> plane;mutable int checked=-1;
 void tick(size_t y)const{if(y%16==0&&checked!=int(y)){check("butteraugli",y,ysize());checked=y;}}
 public:using T=ComponentType;
 Image()=default;
 Image(size_t w,size_t h):plane(std::make_unique<Plane>(w,h)){}
 Image(size_t w,size_t h,T value):Image(w,h){for(size_t y=0;y<h;y++)std::fill_n(Row(y),w,value);}
 Image(Image&&)=default;Image&operator=(Image&&)=default;
 void Swap(Image&other){plane.swap(other.plane);}
 size_t xsize()const{return plane?plane->w:0;}size_t ysize()const{return plane?plane->h:0;}
 T*Row(size_t y){tick(y);return plane->output(y);}
 const T*Row(size_t y)const{tick(y);return plane->row(y);}
};

'''+h[b:]
a=h.index('  const void *BUTTERAUGLI_RESTRICT from = other.bytes();');b=h.index('  return copy;',a)
h=h[:a]+'''  for(size_t y=0;y<other.ysize();y++)std::copy_n(other.Row(y),other.xsize(),copy.Row(y));
'''+h[b:];(out/'butteraugli.h').write_text(h)
s=source('vendor/comparison/butteraugli/butteraugli.cc').read_text();a=s.index('void ConvolveBorderColumn(');b=s.index('// A blur somewhat',a)
s=s[:a]+'''// Preserve per-output native sums while keeping matrix orientation. The old
// two transposes are storage layout only; this evaluates the same horizontal
// then vertical axes without a random-write transpose on external storage.
ImageF ConvolutionAxis(const ImageF&in,const std::vector<float>&kernel,float border_ratio,bool vertical){
 const int length=vertical?in.ysize():in.xsize(),len=kernel.size(),radius=len/2;
 float total=0;for(float v:kernel)total+=v;float scale=1.f/total;
 std::vector<float>scaled=kernel;for(float&v:scaled)v*=scale;
 ImageF out(in.xsize(),in.ysize());
 for(int y=0;y<in.ysize();y++){float*q=out.Row(y);const float*p=vertical?nullptr:in.Row(y);std::vector<const float*>rows;int ylo=std::max(0,y-radius),yhi=std::min(length-1,y+radius);if(vertical)for(int j=ylo;j<=yhi;j++)rows.push_back(in.Row(j));
  for(int x=0;x<in.xsize();x++){
   const int at=vertical?y:x,lo=std::max(0,at-radius),hi=std::min(length-1,at+radius),count=hi-lo+1;
   const bool border=at<radius||at>=length-radius;float factor=1.f;
   if(border){float weight=0;for(int j=lo;j<=hi;j++)weight+=kernel[j-at+radius];weight=(1.f-border_ratio)*weight+border_ratio*total;factor=1.f/weight;}
   float sum=0;int j=0;const int stop=count/4*4;
   auto value=[&](int i){return vertical?rows[i][x]:p[lo+i];};
   auto weight=[&](int i){return border?kernel[lo+i-at+radius]:scaled[i];};
   {
#pragma clang fp contract(off)
    for(;j<stop;j++)sum+=value(j)*weight(j);
    for(;j<count;j++)sum=std::fma(value(j),weight(j),sum);
   }
   q[x]=sum*factor;
  }
 }
 return out;
}

'''+s[b:]
s=s.replace('return Convolution(Convolution(in, kernel, border_ratio),\n                     kernel, border_ratio);','return ConvolutionAxis(ConvolutionAxis(in, kernel, border_ratio,false),kernel,border_ratio,true);')
s=s.replace('std::vector<float> diffs(ysize_ * xsize_);','ImageF diffs(xsize_,ysize_);')
pos=s.index('ImageF diffs(xsize_,ysize_);');a=s.index('    const float* BUTTERAUGLI_RESTRICT const row0',pos);s=s[:a]+'    float*diffrow=diffs.Row(y);\n'+s[a:]
a=s.index('  size_t y0 = 0;',pos);b=s.index('\n}\n',a)
s=s[:pos]+s[pos:a].replace('diffs[ix]','diffrow[x]')+'''  std::vector<float> halo(9*xsize_);
  for(size_t y=0;y<ysize_;y++){
   for(int j=0;j<9;j++){int iy=int(y)+j-4;float*p=halo.data()+j*xsize_;if(iy<0||iy>=ysize_)std::fill_n(p,xsize_,0.f);else std::copy_n(static_cast<const ImageF&>(diffs).Row(iy),xsize_,p);}
   float*q=block_diff_ac->Row(y);
   for(size_t x=0;x<xsize_;x++)q[x]+=PaddedMaltaUnit<false,Tag>(halo.data(),x,4,xsize_,9);
  }
'''+s[b:]

gpu=r"""
EM_JS(void,comparisonGpuCommit,(),{Module.gpuCommitted();});
static bool comparisonGpuEnabled=false;
extern "C" void comparison_butteraugli_gpu_enabled(int value){comparisonGpuEnabled=value!=0;}
EM_ASYNC_JS(int,comparisonGpuBegin,(int w,int h,int radius,int vertical),{try{return await Module.gpuBegin(w,h,radius,vertical);}catch(error){Module.ioError=error;return -1;}});
EM_ASYNC_JS(int,comparisonGpuEnd,(),{Module.gpuEnd();return 0;});
EM_ASYNC_JS(int,comparisonGpuAxis,(int width,int rows,int sourceRows,int sourceTop,int origin,int length,int len,int vertical,const float* input,const float* weights,const float* factors,float* output),{try{return await Module.gpuAxis(width,rows,sourceRows,sourceTop,origin,length,len,vertical,input,weights,factors,output);}catch(error){Module.ioError=error;return -1;}});
static bool comparisonTryGpuAxis(const ImageF&in,const std::vector<float>&kernel,float border_ratio,bool vertical,ImageF&out){
 const int w=in.xsize(),h=in.ysize(),len=kernel.size(),radius=len/2,length=vertical?h:w;
 const int core=comparisonGpuBegin(w,h,radius,vertical);if(core<0)throw std::runtime_error("Butteraugli GPU admission stopped");if(core==0)return false;
 struct Lease{~Lease(){comparisonGpuEnd();}}lease;
 float total=0;for(float v:kernel)total+=v;const float scale=1.f/total;
 std::vector<float>weights(kernel);weights.insert(weights.end(),kernel.begin(),kernel.end());for(int j=len;j<2*len;j++)weights[j]*=scale;
 std::vector<float>factors(length,1.f);for(int at=0;at<length;at++)if(at<radius||at>=length-radius){float weight=0;const int lo=std::max(0,at-radius),hi=std::min(length-1,at+radius);for(int j=lo;j<=hi;j++)weight+=kernel[j-at+radius];weight=(1.f-border_ratio)*weight+border_ratio*total;factors[at]=1.f/weight;}
 std::vector<float>input(size_t(w)*std::min(h,core+(vertical?2*radius:0))),output(size_t(w)*std::min(h,core));
 for(int origin=0;origin<h;origin+=core){check("butteraugli-gpu-convolution",origin,h);const int rows=std::min(core,h-origin),top=vertical?std::max(0,origin-radius):origin,bottom=vertical?std::min(h,origin+rows+radius):origin+rows,sourceRows=bottom-top;
  for(int y=top;y<bottom;y++)std::copy_n(in.Row(y),w,input.data()+size_t(y-top)*w);
  const int result=comparisonGpuAxis(w,rows,sourceRows,vertical?top:0,origin,length,len,vertical,input.data(),weights.data(),factors.data(),output.data());
  if(result<0)throw std::runtime_error("Butteraugli GPU computation stopped");if(result)return false;
  for(int y=0;y<rows;y++)std::copy_n(output.data()+size_t(y)*w,w,out.Row(origin+y));
 }comparisonGpuCommit();return true;
}
"""
s=s.replace('ImageF ConvolutionAxis(',gpu+'\nImageF ConvolutionAxis(',1)
s=s.replace(' ImageF out(in.xsize(),in.ysize());\n for(int y=0;', ' ImageF out(in.xsize(),in.ysize());\n if(comparisonGpuEnabled&&comparisonTryGpuAxis(in,kernel,border_ratio,vertical,out))return out;\n for(int y=0;',1)

(out/'butteraugli.cc').write_text(s)
