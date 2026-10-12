#pragma once
// Owned C ABI adapter only. No MATLAB library or runtime is required.
#include <cstdlib>
#include <cstdio>
#include <stdexcept>
#include <map>
#include <string>
#include <vector>
typedef int mwSize;
enum mxClassID {mxSINGLE_CLASS,mxUINT32_CLASS,mxUINT8_CLASS};
const int mxREAL=0;
struct mxArray {
  void *data=nullptr; double scalar=0; std::vector<mwSize> dims;
  std::map<std::string,mxArray*> fields; bool owned=false;
  ~mxArray(){if(owned)std::free(data);}
};
inline void *mxGetData(const mxArray*a){return a->data;}
inline mxArray *mxGetField(const mxArray*a,int,const char*n){return a->fields.at(n);}
inline double mxGetScalar(const mxArray*a){return a->scalar;}
inline const mwSize *mxGetDimensions(const mxArray*a){return a->dims.data();}
inline size_t mxGetNumberOfDimensions(const mxArray*a){return a->dims.size();}
inline size_t mxGetNumberOfElements(const mxArray*a){size_t n=1;for(auto d:a->dims)n*=d;return n;}
inline mxArray *mxCreateNumericArray(int n,const int*d,mxClassID type,int){
 auto*a=new mxArray;a->dims.assign(d,d+n);size_t size=type==mxUINT8_CLASS?1:4;
 a->data=std::calloc(mxGetNumberOfElements(a),size);a->owned=true;
 if(!a->data){delete a;throw std::bad_alloc();}return a;
}
inline void mexPrintf(const char*,int){}
