// SHERLOQ float32 arithmetic anchor: one float32 FMA accumulator per output, k ascending.
// Keys are transposed/padded once; padding is physical storage, never a key.
#include <math.h>
#ifdef CROSS_RELAXED_FMA
#include <wasm_simd128.h>
#endif
void cross_dot(const float *q,const float *kt,float *out,int rows,int keys4,int dim){
 for(int row=0;row<rows;row++){
  for(int key=0;key<keys4;key+=4){
#ifdef CROSS_RELAXED_FMA
   v128_t accumulator=wasm_f32x4_splat(0.0f);
   for(int d=0;d<dim;d++)accumulator=wasm_f32x4_relaxed_madd(wasm_f32x4_splat(q[row*dim+d]),wasm_v128_load(kt+d*keys4+key),accumulator);
   wasm_v128_store(out+row*keys4+key,accumulator);
#else
   float a=0,b=0,c=0,e=0;
   for(int d=0;d<dim;d++){float x=q[row*dim+d];const float *k=kt+d*keys4+key;a=fmaf(x,k[0],a);b=fmaf(x,k[1],b);c=fmaf(x,k[2],c);e=fmaf(x,k[3],e);}
   out[row*keys4+key]=a;out[row*keys4+key+1]=b;out[row*keys4+key+2]=c;out[row*keys4+key+3]=e;
#endif
  }
 }
}
void fma_triplets(const float *a,const float *b,const float *c,float *out,int vectors){
 for(int i=0;i<vectors*4;i+=4){
#ifdef CROSS_RELAXED_FMA
  wasm_v128_store(out+i,wasm_f32x4_relaxed_madd(wasm_v128_load(a+i),wasm_v128_load(b+i),wasm_v128_load(c+i)));
#else
  for(int lane=0;lane<4;lane++)out[i+lane]=fmaf(a[i+lane],b[i+lane],c[i+lane]);
#endif
 }
}
