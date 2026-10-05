#include "fma-simd.h"
extern "C" int d2prl_fma_values(const float* a,const float* b,const float* c,int count,float* out){
 if(count<4||count%4)return -1;unsigned fallbacks=0;for(int i=0;i<count;i+=4)wasm_v128_store(out+i,d2prl_fma4(wasm_v128_load(a+i),wasm_v128_load(b+i),wasm_v128_load(c+i),&fallbacks));return (int)fallbacks;
}
