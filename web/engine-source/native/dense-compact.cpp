// Native compact SIFT representation: exact reconstruction, not quantization.
#include "../vendor/dense-source/compact_sift.h"
extern "C" {
#include "../vendor/dense-source/src/vlfeat/vl/imopv.h"
int sherloq_sift_inputs(const float*,int,int,int,int,float*,float*);
void sherloq_sift_pack_range(const float*,const float*,int,int,int,size_t,int,float*);
void sherloq_sift_norm_factors(float*,int,float*);
int sherloq_patchmatch_compact(const CompactSift*,const CompactSift*,const unsigned char*,int,int,int,float,float,int,uint32_t,int*,float*,uint64_t*,int(*)(),char*,float,float,const float*,const float*,size_t);
}
#include <cmath>
#include <memory>
#include <cstring>
#include <stdexcept>
struct PackedSift {std::vector<float> hist,norms;std::vector<unsigned char> turns,diverse;CompactSift field{};};
static std::unique_ptr<PackedSift> packed[2];
static float pairwise(const float* a,int n,bool square=false){
 #pragma clang fp contract(off)
 float r[8];for(int j=0;j<8;j++)r[j]=square?a[j]*a[j]:a[j];for(int i=8;i<n;i+=8)for(int j=0;j<8;j++)r[j]+=square?a[i+j]*a[i+j]:a[i+j];return ((r[0]+r[1])+(r[2]+r[3]))+((r[4]+r[5])+(r[6]+r[7]));
}
static int frame(float* d,bool rotate){
 float hist[8]={};for(int c=0;c<16;c++)for(int b=0;b<8;b++)hist[b]+=d[c*8+b];int turn=0;float best=-INFINITY;for(int t=0;t<4;t++){float e=hist[2*t]+hist[2*t+1];if(e>best){best=e;turn=t;}}
 if(rotate){float copy[128];std::copy_n(d,128,copy);for(int y=0;y<4;y++)for(int x=0;x<4;x++){int sx=turn==1?3-y:turn==2?3-x:turn==3?y:x,sy=turn==1?x:turn==2?3-y:turn==3?3-x:y;for(int b=0;b<8;b++)d[(y*4+x)*8+b]=copy[(sy*4+sx)*8+(b+2*turn)%8];}}return turn;
}
static bool diversity(const float* d){
 float h[8]={},cosine[8],sine[8];const int cos[8]={1,0,-1,0,1,0,-1,0},sin[8]={0,1,0,-1,0,1,0,-1};for(int c=0;c<16;c++)for(int b=0;b<8;b++)h[b]+=d[c*8+b];for(int b=0;b<8;b++){cosine[b]=h[b]*cos[b];sine[b]=h[b]*sin[b];}float total=pairwise(h,8),c=pairwise(cosine,8),s=pairwise(sine,8),anisotropy=float(std::sqrt(double(c*c+s*s)));return total>0&&total-anisotropy>=.1f*(total+anisotropy);
}
extern "C" int dense_compact_prepare(const float* gray,int width,int height,int patch,int mirror,int quarter,int support,int slot,char* error){
 try{
  if(slot<0||slot>1||patch<3||patch>32||support<patch||support>32||(support-patch)%2||width<=3*support||height<=3*support)throw std::runtime_error("Invalid compact dense shape");
  packed[slot].reset();auto out=std::make_unique<PackedSift>();const size_t n=size_t(width)*height,dn=size_t(width-3*patch)*(height-3*patch);auto& f=out->field;f.width=width;f.height=height;f.patch=patch;f.offset=3*(support-patch)/2;f.view_width=width-3*support;f.view_height=height-3*support;f.mirror=mirror;f.quarter=quarter;
  {std::vector<float> gradients(n*8),tmp(n),filtered(n);if(sherloq_sift_inputs(gray,width,height,patch,mirror,gradients.data(),f.weights))throw std::runtime_error("Compact SIFT gradient preparation failed");out->hist.resize(n*8);
   for(int bin=0;bin<8;bin++){vl_imconvcoltri_f(tmp.data(),height,gradients.data()+n*bin,width,height,width,patch,1,VL_PAD_BY_CONTINUITY|VL_TRANSPOSE);vl_imconvcoltri_f(filtered.data(),width,tmp.data(),height,width,height,patch,1,VL_PAD_BY_CONTINUITY|VL_TRANSPOSE);for(size_t i=0;i<n;i++)out->hist[i*8+bin]=filtered[i];}
  }
  out->norms.resize(dn*3);out->turns.resize(dn);out->diverse.resize(dn);std::vector<float> raw(std::min(size_t(8192),dn)*128);
  for(size_t start=0;start<dn;start+=8192){int count=std::min(size_t(8192),dn-start);sherloq_sift_pack_range(out->hist.data(),f.weights,width,height,patch,start,count,raw.data());sherloq_sift_norm_factors(raw.data(),count,out->norms.data()+start*3);
   for(int i=0;i<count;i++){float* d=raw.data()+size_t(i)*128;float norm=std::max(float(std::sqrt(double(pairwise(d,128,true)))),1e-12f);out->norms[(start+i)*3+2]=norm;for(int k=0;k<128;k++)d[k]/=norm;out->turns[start+i]=frame(d,quarter);out->diverse[start+i]=diversity(d);}
  }
  f.hist=out->hist.data();f.norms=out->norms.data();f.turns=out->turns.data();packed[slot]=std::move(out);return 0;
 }catch(const std::exception& e){std::strncpy(error,e.what(),1023);error[1023]=0;return -1;}
}
extern "C" int dense_compact_unpack(int slot,int first,int count,float* output){if(slot<0||slot>1||!packed[slot])return -1;const auto& f=packed[slot]->field;if(first<0||count<0||int64_t(first)+count>int64_t(f.view_width)*f.view_height)return -1;for(int i=0;i<count;i++)compact_sift_read(f,first+i,output+size_t(i)*128);return 0;}
extern "C" int dense_compact_field(unsigned char* mask,int second,int compare,float minimum,float maximum,int iterations,uint32_t seed,int* matches,float* distances,uint64_t* comparisons,char* error,float gapx,float gapy,const float* xmap,const float* ymap,size_t cache_slots){
 if(!packed[0]||second<0||second>1||!packed[second])return -1;auto& a=packed[0]->field;auto& b=packed[second]->field;
 for(int i=0;i<a.view_width*a.view_height;i++)for(int slot: {0,second}){const auto& value=*packed[slot];const auto& f=value.field;if(f.quarter){int x=i%f.view_width+f.offset,y=i/f.view_width+f.offset;if(f.mirror)x=f.width-3*f.patch-1-x;if(!value.diverse[size_t(y)*(f.width-3*f.patch)+x])mask[i]=0;}}
 return sherloq_patchmatch_compact(&a,&b,mask,a.view_width,a.view_height,compare,minimum,maximum,iterations,seed,matches,distances,comparisons,nullptr,error,gapx,gapy,xmap,ymap,cache_slots);
}
extern "C" void dense_compact_release(){packed[0].reset();packed[1].reset();}
