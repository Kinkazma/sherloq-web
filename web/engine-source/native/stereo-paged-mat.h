#pragma once
#include <opencv2/core.hpp>
#include <emscripten/emscripten.h>
#include <algorithm>
#include <cstdint>
#include <vector>
#include <stdexcept>
extern "C" int stereoPagedAllocate(double bytes);
extern "C" void stereoPagedDrop(int id);
extern "C" void stereoPagedTransfer(int id,double offset,int length,void* pointer,int write);
extern "C" void stereoPagedCheck(int row,int total);
namespace cv {
// A complete logical matrix. Row pointers remain valid until their cache slot
// is replaced. 96 rows cover every simultaneous stencil in the native method
// (Gaussian radius <=38, polynomial radius5, flow window15).
class PagedMat {
 struct Row {int y=-1;bool dirty=false;std::vector<float> values;};
 mutable std::vector<Row> cache;
 int id=-1,kind=-1;
 void save(Row& r)const{if(r.dirty){stereoPagedTransfer(id,double(r.y)*cols*channels()*4,cols*channels()*4,r.values.data(),1);r.dirty=false;}}
 float* row(int y,bool write)const{
  if(y<0||y>=rows)throw std::runtime_error("Paged matrix row outside image");
  auto& r=cache[y%cache.size()];
  if(r.y!=y){save(r);r.values.resize(size_t(cols)*channels());stereoPagedTransfer(id,double(y)*cols*channels()*4,cols*channels()*4,r.values.data(),0);r.y=y;}
  r.dirty|=write;return r.values.data();
 }
 public:
 int rows=0,cols=0;
 PagedMat()=default;PagedMat(const PagedMat&)=delete;PagedMat&operator=(const PagedMat&)=delete;
 int type()const{return kind;}int channels()const{return CV_MAT_CN(kind);}Size size()const{return Size(cols,rows);}bool empty()const{return id<0;}
 void create(int h,int w,int t){if(h==rows&&w==cols&&t==kind&&id>=0)return;release();if(h<1||w<1||CV_MAT_DEPTH(t)!=CV_32F)throw std::runtime_error("Invalid paged matrix");rows=h;cols=w;kind=t;id=stereoPagedAllocate(double(h)*w*channels()*4);cache.resize(std::min(h,96));}
 template<class T>T* ptr(int y=0){static_assert(sizeof(T)==4);return reinterpret_cast<T*>(row(y,true));}
 template<class T>const T* ptr(int y=0)const{static_assert(sizeof(T)==4);return reinterpret_cast<const T*>(row(y,false));}
 void flush(){for(auto&r:cache)save(r);}
 void release(){if(id>=0){stereoPagedDrop(id);id=-1;}cache.clear();cache.shrink_to_fit();rows=cols=0;kind=-1;}
 void zero(){for(int y=0;y<rows;y++){std::fill_n(ptr<float>(y),cols*channels(),0.f);stereoPagedCheck(y,rows);}}
};
void FarnebackPolyExp(const PagedMat&,PagedMat&,int,double);
void FarnebackUpdateMatrices(const PagedMat&,const PagedMat&,const PagedMat&,PagedMat&,int,int);
void FarnebackUpdateFlow_GaussianBlur(const PagedMat&,const PagedMat&,PagedMat&,PagedMat&,int,bool);
}
