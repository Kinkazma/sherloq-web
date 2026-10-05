#pragma once
#include <emscripten.h>
#include <memory>
#include <vector>
#include <algorithm>
#include <stdexcept>
#ifndef COMPARISON_PAGED_DECLARE_CALLBACKS
EM_ASYNC_JS(int,sewarAlloc,(double bytes),{try{return await Module.allocate(bytes);}catch(e){Module.ioError=e;return -1;}});
EM_ASYNC_JS(int,sewarDrop,(int id),{try{await Module.drop(id);return 0;}catch(e){Module.ioError=e;return 1;}});
EM_ASYNC_JS(int,sewarIO,(int id,double offset,int length,void* pointer,int write),{try{await Module.transfer(id,offset,length,pointer,write);return 0;}catch(e){Module.ioError=e;return 1;}});
EM_ASYNC_JS(int,sewarSource,(int side,int row,void* pointer),{try{await Module.source(side,row,pointer);return 0;}catch(e){Module.ioError=e;return 1;}});
EM_ASYNC_JS(int,sewarCheck,(const char* phase,int completed,int total),{try{await Module.checkpoint(UTF8ToString(phase),completed,total);return 0;}catch(e){Module.ioError=e;return 1;}});
#else
extern "C" {int sewarAlloc(double);int sewarDrop(int);int sewarIO(int,double,int,void*,int);int sewarSource(int,int,void*);int sewarCheck(const char*,int,int);}
#endif
static void check(const char* phase,int row,int total){if(sewarCheck(phase,row,total))throw std::runtime_error("Comparison stopped");}
template<class T,int BlockRows=32,int Slots=2> class ComparisonPlane {
 struct Store {
  struct Page{int index=-1;bool dirty=false;std::vector<T> values;};
  int id,w,h;std::vector<Page> cache;
  Store(int w,int h):id(sewarAlloc(double(w)*h*sizeof(T))),w(w),h(h),cache(Slots){if(id<0)throw std::runtime_error("Comparison storage allocation failed");}
  ~Store(){sewarDrop(id);}
  T* row(int y,bool write){
   if(y<0||y>=h)throw std::runtime_error("Comparison row outside image");
   const int page=y/BlockRows;auto&r=cache[page%Slots];
   if(r.index!=page){
    if(r.dirty&&sewarIO(id,double(r.index)*BlockRows*w*sizeof(T),r.values.size()*sizeof(T),r.values.data(),1))throw std::runtime_error("Comparison write failed");
    r.values.resize(size_t(w)*std::min(BlockRows,h-page*BlockRows));
    if(sewarIO(id,double(page)*BlockRows*w*sizeof(T),r.values.size()*sizeof(T),r.values.data(),0))throw std::runtime_error("Comparison read failed");
    r.index=page;r.dirty=false;
   }
   r.dirty|=write;return r.values.data()+size_t(y%BlockRows)*w;
  }
 };
 std::shared_ptr<Store> store;
 public:int w,h;ComparisonPlane(int w,int h):store(std::make_shared<Store>(w,h)),w(w),h(h){}
 const T* row(int y)const{return store->row(y,false);}T* output(int y){return store->row(y,true);}
};
