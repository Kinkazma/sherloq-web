#include <cstdlib>
#include <cmath>
#include <cstring>
#include <vector>
#include <thread>
#include <algorithm>
#include <mutex>
#include <exception>
#include <memory>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif
static int ssg_team=1;
template<class F> void ssg_parallel(int n,F job){
#ifdef __EMSCRIPTEN_PTHREADS__
 int team=std::min(n,ssg_team);std::vector<std::thread> workers;std::exception_ptr failure;std::mutex mutex;
 auto work=[&](int t){try{for(int i=t;i<n;i+=team)job(i);}catch(...){std::lock_guard<std::mutex> lock(mutex);if(!failure)failure=std::current_exception();}};
 try{for(int t=1;t<team;t++)workers.emplace_back([&,t](){work(t);});work(0);}catch(...){failure=std::current_exception();}
 for(auto&w:workers)w.join();if(failure)std::rethrow_exception(failure);
#else
 for(int i=0;i<n;i++)job(i);
#endif
}
#include "mex.h"
#include "rgbConvertMex.cpp"
#include "imPadMex.cpp"
#include "convConst.cpp"
#include "imResampleMex.cpp"
#include "gradientMex.cpp"
#define mexFunction ssg_forest_mex
#include "edgesDetectMex.cpp"
#undef mexFunction

// Numeric kernels above are the pinned official files, unchanged. This adapter
// assembles edgesChns.m/edgesDetect.m with their real thirteen channels, original
// typed model, checkerboard forest and sharpen=2 segmentations.
static mxArray model,opts,fields[7],options[13];
static float *output=nullptr,*regular=nullptr,*similar=nullptr;
static uint32 *leaves=nullptr;static size_t refused=0;
static int outputN=0,channelN=0,leafN=0;
struct Plane{float*p;int h,w,d;Plane(int H,int W,int D):h(H),w(W),d(D){p=(float*)wrCalloc((size_t)h*w*d,4);if(!p){refused=(size_t)h*w*d*4;throw std::bad_alloc();}}~Plane(){wrFree(p);}Plane(const Plane&)=delete;};
static void tri(float*I,float*O,int h,int w,int d,int r){if(!r){memcpy(O,I,(size_t)h*w*d*4);return;}ssg_parallel(d,[&](int z){if(r==1)convTri1(I+(size_t)z*h*w,O+(size_t)z*h*w,h,w,1,2,1);else convTri(I+(size_t)z*h*w,O+(size_t)z*h*w,h,w,1,r,1);});}
extern "C" {
void ssg_edges_shutdown(){
#ifdef __EMSCRIPTEN_PTHREADS__
 EM_ASM({PThread.terminateAllThreads();});
#endif
}
float ssg_edges_approx(float x,int root){return ssg_sse_approx(x,root!=0);}
void ssg_edges_set_team(int n){ssg_team=std::max(1,n);}
void ssg_edges_release(){free(output);free(regular);free(similar);free(leaves);output=regular=similar=nullptr;leaves=nullptr;outputN=channelN=leafN=0;}
size_t ssg_edges_allocation_bytes(){return refused;}
float *ssg_edges_output(){return output;}
float *ssg_edges_regular(){return regular;}
float *ssg_edges_similar(){return similar;}
uint32 *ssg_edges_leaves(){return leaves;}
int ssg_edges_channel_count(){return channelN;}
int ssg_edges_leaf_count(){return leafN;}
int ssg_edges_set_model(float*thrs,uint32*fids,uint32*child,uint8*segs,uint8*nSegs,uint16*eBins,uint32*eBnds,int nodes,int bins,int bounds){
 if(!thrs||!fids||!child||!segs||!nSegs||!eBins||!eBnds||nodes<=0||bins<=0||bounds!=nodes*8*3+1)return -1;
 const char*names[]={"thrs","fids","child","segs","nSegs","eBins","eBnds"};void*ptr[]={thrs,fids,child,segs,nSegs,eBins,eBnds};
 for(int i=0;i<7;i++){fields[i].data=ptr[i];fields[i].dims={nodes,8};model.fields[names[i]]=&fields[i];}
 fields[3].dims={16,16,nodes,8};fields[5].dims={bins};fields[6].dims={bounds};
 const char*on[]={"shrink","imWidth","gtWidth","nChns","nCells","nChnFtrs","stride","nTreesEval","sharpen","nThreads"};double val[]={2,32,16,13,5,3328,2,4,2,1};
 for(int i=0;i<10;i++){options[i].scalar=val[i];opts.fields[on[i]]=&options[i];}model.fields["opts"]=&opts;return 0;
}
int ssg_edges_detect(unsigned char*rgb,int rows,int cols,int diagnostics){
 ssg_edges_release();refused=0;if(!rgb||rows<16||cols<16||model.fields.empty())return -1;
 try{
  int h=rows+32+(4-rows%4)%4,w=cols+32+(4-cols%4)%4,hc=h/2,wc=w/2,n=h*w;
  std::unique_ptr<unsigned char,decltype(&wrFree)> padded((unsigned char*)wrMalloc((size_t)n*3),wrFree);if(!padded)throw std::bad_alloc();imPad(rgb,padded.get(),rows,cols,3,16,h-rows-16,16,w-cols-16,2,(unsigned char)0);
  float *luv=rgbConvert<unsigned char,float>(padded.get(),n,3,2,1.f/255);if(!luv)throw std::bad_alloc();
  Plane small(hc,wc,3),channels(hc,wc,13),reg(hc,wc,13),sim(hc,wc,13);
  resample(luv,small.p,h,hc,w,wc,3,1.f);memcpy(channels.p,small.p,(size_t)hc*wc*3*4);
  int offset=3;
  for(int scale=1;scale<=2;scale++){
   int gh=h/scale,gw=w/scale;float*im=scale==1?luv:small.p;Plane M(gh,gw,1),O(gh,gw,1),norm(gh,gw,1),hist(hc,wc,4);
   gradMag(im,M.p,O.p,gh,gw,3,false);tri(M.p,norm.p,gh,gw,1,4);gradMagNorm(M.p,norm.p,gh,gw,.01f);
   gradHist(M.p,O.p,hist.p,gh,gw,2/scale,4,0,false);
   resample(M.p,channels.p+(size_t)offset*hc*wc,gh,hc,gw,wc,1,1.f);offset++;
   memcpy(channels.p+(size_t)offset*hc*wc,hist.p,(size_t)hc*wc*4*4);offset+=4;
  }
  free(luv);tri(channels.p,reg.p,hc,wc,13,1);tri(channels.p,sim.p,hc,wc,13,4);
  float*color=rgbConvert<unsigned char,float>(padded.get(),n,3,1,1.f/255);if(!color)throw std::bad_alloc();Plane smooth(h,w,3);tri(color,smooth.p,h,w,3,1);free(color);
  mxArray im,cr,cs;im.data=smooth.p;im.dims={h,w,3};cr.data=reg.p;cr.dims={hc,wc,13};cs.data=sim.p;cs.dims=cr.dims;
  const mxArray*in[]={&model,&im,&cr,&cs};mxArray*out[2]={};ssg_forest_mex(2,out,4,in);
  int oh=out[0]->dims[0];float*edge=(float*)out[0]->data;Plane crop(rows,cols,1);float factor=4.f/256/4*1.66f;
  for(int x=0;x<cols;x++)for(int y=0;y<rows;y++)crop.p[x*rows+y]=edge[(x+8)*oh+y+8]*factor;
  output=(float*)wrCalloc((size_t)rows*cols,4);if(!output)throw std::bad_alloc();tri(crop.p,output,rows,cols,1,1);outputN=rows*cols;
  if(diagnostics){channelN=hc*wc*13;regular=(float*)malloc((size_t)channelN*4);similar=(float*)malloc((size_t)channelN*4);leafN=mxGetNumberOfElements(out[1]);leaves=(uint32*)malloc((size_t)leafN*4);if(!regular||!similar||!leaves)throw std::bad_alloc();memcpy(regular,reg.p,(size_t)channelN*4);memcpy(similar,sim.p,(size_t)channelN*4);memcpy(leaves,out[1]->data,(size_t)leafN*4);}
  delete out[0];delete out[1];return outputN;
 }catch(const std::bad_alloc&){ssg_edges_release();return -2;}catch(...){ssg_edges_release();return -3;}
}
}
