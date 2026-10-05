/* Float32 operator order of the pinned PyTorch/Accelerate CPU CFA reference.
 * Coefficients are unchanged. Bias placement follows complete 64-position
 * SGEMM blocks, with an epilogue bias on the final remainder. */
#include <math.h>
#include <stddef.h>
#include <wasm_simd128.h>
extern float xexpf(float);
extern float xlogf_u1(float);
extern float xlog1pf(float);
/* Four independent float32 fused products. Double products are exact; the
 * rare double-rounding midpoint is delegated to libc fmaf, preserving IEEE
 * semantics rather than relying on relaxed SIMD's optional contraction. */
static inline v128_t fma4(v128_t x,float w,v128_t acc){
 v128_t xd0=wasm_f64x2_promote_low_f32x4(x),xd1=wasm_f64x2_promote_low_f32x4(wasm_i32x4_shuffle(x,x,2,3,0,1));
 v128_t ad0=wasm_f64x2_promote_low_f32x4(acc),ad1=wasm_f64x2_promote_low_f32x4(wasm_i32x4_shuffle(acc,acc,2,3,0,1)),wd=wasm_f64x2_splat(w);
 v128_t d0=wasm_f64x2_add(wasm_f64x2_mul(xd0,wd),ad0),d1=wasm_f64x2_add(wasm_f64x2_mul(xd1,wd),ad1);
 v128_t r0=wasm_f32x4_demote_f64x2_zero(d0),r1=wasm_f32x4_demote_f64x2_zero(d1),r=wasm_i32x4_shuffle(r0,r1,0,1,4,5);
 v128_t mask=wasm_i64x2_splat(0x1fffffff),mid=wasm_i64x2_splat(0x10000000);
 int rare=wasm_v128_any_true(wasm_i64x2_eq(wasm_v128_and(d0,mask),mid))||wasm_v128_any_true(wasm_i64x2_eq(wasm_v128_and(d1,mask),mid));
 rare|=wasm_v128_any_true(wasm_v128_and(wasm_f64x2_lt(wasm_f64x2_abs(d0),wasm_f64x2_splat(0x1p-126)),wasm_f64x2_ne(d0,wasm_f64x2_splat(0))))||wasm_v128_any_true(wasm_v128_and(wasm_f64x2_lt(wasm_f64x2_abs(d1),wasm_f64x2_splat(0x1p-126)),wasm_f64x2_ne(d1,wasm_f64x2_splat(0))));
 if(rare){float xv[4],av[4],rv[4];wasm_v128_store(xv,x);wasm_v128_store(av,acc);for(int i=0;i<4;i++)rv[i]=fmaf(xv[i],w,av[i]);return wasm_v128_load(rv);}
 return r;
}
static void conv_scope(const float* x,const float* weights,const float* bias,float* out,int batch,int ci,int ih,int iw,int co,int kh,int kw,int dh,int dw,int groups,int fullPixels,int positionOffset,int fullWidth){
 int oh=ih-(kh-1)*dh,ow=iw-(kw-1)*dw,n=oh*ow,cg=ci/groups,og=co/groups;
 if(!fullPixels)fullPixels=n;int cut=fullPixels/64*64;
 for(int b=0;b<batch;b++)for(int c=0;c<co;c++)for(int y=0;y<oh;y++)for(int z=0;z<ow;z++){
  int pos=y*ow+z,pixel=(fullWidth?y*fullWidth+z:pos)+positionOffset;int core=(og<=16&&fullPixels%1024==0)?pixel>=16&&pixel<fullPixels-48:pixel<cut;float acc=core?bias[c]:0.f;int group=c/og;
  if(n==1&&kh==1&&kw==1){
   const float* a=x+b*ci+group*cg;const float* w=weights+c*cg;float v[4]={0,0,0,0};
   if(cg<=3){for(int i=0;i<cg;i++)acc=i?acc+a[i]*w[i]:a[i]*w[i];}
   else if(cg<=8){
    if(cg==4){for(int i=0;i<4;i++)v[i]=a[i]*w[i];}
    else{for(int i=0;i<cg-4;i++)v[i]=a[i]*w[i];for(int i=0;i<4;i++)v[i]+=a[cg-4+i]*w[cg-4+i];}
    acc=(v[0]+v[2])+(v[1]+v[3]);
   }else{
    int end=(cg-1)/4*4;for(int i=0;i<end;i++)v[i%4]=fmaf(a[i],w[i],v[i%4]);
    for(int i=end;i<cg;i++)v[i-(cg-4)]+=a[i]*w[i];
    acc=c%og<og/2*2?(v[0]+v[1])+(v[2]+v[3]):(v[0]+v[2])+(v[1]+v[3]);
   }
   out[b*co+c]=acc+bias[c];continue;
  }
  if(z+3<ow){
   float initial[4];int cores[4];for(int j=0;j<4;j++){int p=pixel+j;cores[j]=(og<=16&&fullPixels%1024==0)?p>=16&&p<fullPixels-48:p<cut;initial[j]=cores[j]?bias[c]:0.f;}
   v128_t accum=wasm_v128_load(initial);
   for(int ic=0;ic<cg;ic++)for(int ky=0;ky<kh;ky++)for(int kx=0;kx<kw;kx++){
    const float* value=x+((b*ci+group*cg+ic)*ih+y+ky*dh)*iw+z+kx*dw;float weight=weights[((c*cg+ic)*kh+ky)*kw+kx];accum=fma4(wasm_v128_load(value),weight,accum);
   }
   float final[4];wasm_v128_store(final,accum);for(int j=0;j<4;j++)out[(b*co+c)*n+pos+j]=cores[j]?final[j]:final[j]+bias[c];z+=3;continue;
  }
  for(int ic=0;ic<cg;ic++)for(int ky=0;ky<kh;ky++)for(int kx=0;kx<kw;kx++){
   float value=x[((b*ci+group*cg+ic)*ih+y+ky*dh)*iw+z+kx*dw];float weight=weights[((c*cg+ic)*kh+ky)*kw+kx];acc=fmaf(value,weight,acc);
  }
  out[(b*co+c)*n+pos]=core?acc:acc+bias[c];
 }
}
void cfa_conv(const float* x,const float* w,const float* bias,float* out,int b,int ci,int ih,int iw,int co,int kh,int kw,int dh,int dw,int groups){
 conv_scope(x,w,bias,out,b,ci,ih,iw,co,kh,kw,dh,dw,groups,0,0,0);
}
/* Rows of an unchanged full-image DnCNN: bias order follows global positions. */
void cfa_conv_global(const float* x,const float* w,const float* bias,float* out,int ci,int ih,int iw,int co,int fullHeight,int offsetY){
 conv_scope(x,w,bias,out,1,ci,ih,iw,co,3,3,1,1,1,fullHeight*(iw-2),offsetY*(iw-2),0);
}
/* Arbitrary full-image window: same global bias epilogue, all spatial halos. */
void cfa_conv_window(const float* x,const float* w,const float* bias,float* out,int ci,int ih,int iw,int co,int fullHeight,int fullWidth,int offsetY,int offsetX){
 conv_scope(x,w,bias,out,1,ci,ih,iw,co,3,3,1,1,1,fullHeight*fullWidth,offsetY*fullWidth+offsetX,fullWidth);
}
void cfa_activate(float* data,int length,int kind){
 int chunks=length>32768?2:1,chunk=(length+chunks-1)/chunks;
 for(int i=0;i<length;i++){
  int start=i/chunk*chunk,end=start+chunk;if(end>length)end=length;int vector=start+(end-start)/8*8;
  float x=data[i];
  if(kind==0)data[i]=x>20.f?x:i<vector?xlog1pf(xexpf(x)):(float)log1p((double)(float)exp((double)x));
  else data[i]=x>0?x:x*.01f;
 }
}
void cfa_pool(const float* x,float* out,int batch,int channels,int ih,int iw,int size){
 int oh=ih/size,ow=iw/size;
 for(int b=0;b<batch;b++)for(int c=0;c<channels;c++)for(int y=0;y<oh;y++)for(int z=0;z<ow;z++){
  float sum=0.f;for(int ky=0;ky<size;ky++)for(int kx=0;kx<size;kx++)sum+=x[((b*channels+c)*ih+y*size+ky)*iw+z*size+kx];
  out[((b*channels+c)*oh+y)*ow+z]=sum/(size*size);
 }
}
void cfa_logsoftmax(const float* x,float* out,int batch,int channels,int pixels){
 for(int b=0;b<batch;b++)for(int i=0;i<pixels;i++){
  float max=-INFINITY;for(int c=0;c<channels;c++)max=fmaxf(max,x[(b*channels+c)*pixels+i]);
  float sum=0.f;for(int c=0;c<channels;c++)sum+=xexpf(x[(b*channels+c)*pixels+i]-max);
  float logsum=xlogf_u1(sum);for(int c=0;c<channels;c++)out[(b*channels+c)*pixels+i]=(x[(b*channels+c)*pixels+i]-max)-logsum;
 }
}
void cfa_slice(const float* x,float* out,const int* shape,const int* result,const int* start,const int* step){
 int at=0;for(int b=0;b<result[0];b++)for(int c=0;c<result[1];c++)for(int y=0;y<result[2];y++)for(int z=0;z<result[3];z++)
  out[at++]=x[(((start[0]+b*step[0])*shape[1]+start[1]+c*step[1])*shape[2]+start[2]+y*step[2])*shape[3]+start[3]+z*step[3]];
}
