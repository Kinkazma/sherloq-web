// Bounded native descriptor tiles, followed by the unchanged global field.
#include <vector>
#include <algorithm>
#include <cmath>
#include <cstring>
#include <cstdint>
extern "C" int sherloq_dense_features(const float*,int,int,int,int,int,float*,float*,char*);
extern "C" int sherloq_patchmatch_bounded(const float*,const float*,const unsigned char*,int,int,int,int,float,float,int,uint32_t,int*,float*,uint64_t*,int(*)(),char*,float,float,const float*,const float*);
static std::vector<float> resident_first,resident_second;static int resident_width=0,resident_height=0;
static void normalize12(float* v){float r[8];for(int i=0;i<8;i++)r[i]=v[i]*v[i];float sum=((r[0]+r[1])+(r[2]+r[3]))+((r[4]+r[5])+(r[6]+r[7]));for(int i=8;i<12;i++)sum+=v[i]*v[i];float norm=std::max(float(std::sqrt(double(sum))),1e-12f);for(int i=0;i<12;i++)v[i]/=norm;}
extern "C" void dense_resident_release(){std::vector<float>().swap(resident_first);std::vector<float>().swap(resident_second);resident_width=resident_height=0;}
extern "C" int dense_resident_zernike(const float* gray,int width,int height,int patch,int mirror,char* error){
 try{dense_resident_release();if(patch<2||patch>32||width<=3*patch||height<=3*patch)return -1;const size_t n=size_t(width)*height;resident_first.resize(n*12);if(mirror)resident_second.resize(n*12);const int halo=3*patch+1,tile=128;
  for(int top=0;top<height;top+=tile)for(int left=0;left<width;left+=tile){const int cw=std::min(tile,width-left),ch=std::min(tile,height-top),x0=std::max(0,left-halo),y0=std::max(0,top-halo),x1=std::min(width,left+cw+halo),y1=std::min(height,top+ch+halo),w=x1-x0,h=y1-y0;std::vector<float> input(size_t(w)*h),a(size_t(w)*h*12),b(mirror?size_t(w)*h*12:0);
   for(int y=0;y<h;y++)std::copy_n(gray+size_t(y+y0)*width+x0,w,input.data()+size_t(y)*w);if(sherloq_dense_features(input.data(),w,h,0,patch,mirror,a.data(),mirror?b.data():nullptr,error))return -1;
   for(int y=0;y<ch;y++)for(int x=0;x<cw;x++){const size_t source=(size_t(top+y-y0)*w+left+x-x0)*12,dest=(size_t(top+y)*width+left+x)*12;normalize12(a.data()+source);std::copy_n(a.data()+source,12,resident_first.data()+dest);if(mirror){normalize12(b.data()+source);std::copy_n(b.data()+source,12,resident_second.data()+dest);}}
  }resident_width=width;resident_height=height;return 0;
 }catch(const std::exception& e){std::strncpy(error,e.what(),1023);error[1023]=0;dense_resident_release();return -1;}
}
extern "C" int dense_resident_unpack(int second,int first,int count,float* output){if(!resident_width||first<0||count<0||size_t(first)+count>size_t(resident_width)*resident_height)return -1;const auto& values=second&&!resident_second.empty()?resident_second:resident_first;std::copy_n(values.data()+size_t(first)*12,size_t(count)*12,output);return 0;}
extern "C" int dense_resident_field(const unsigned char* mask,int compare,float minimum,float maximum,int iterations,uint32_t seed,int* matches,float* distances,uint64_t* comparisons,char* error,float gapx,float gapy,const float* xmap,const float* ymap){if(!resident_width)return -1;return sherloq_patchmatch_bounded(resident_first.data(),resident_second.empty()?resident_first.data():resident_second.data(),mask,resident_width,resident_height,12,compare,minimum,maximum,iterations,seed,matches,distances,comparisons,nullptr,error,gapx,gapy,xmap,ymap);}
