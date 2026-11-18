#include "echo.cpp"


// Typed native16 entry. The original uint8 functions above are unchanged.
// For r<=4 let S=sum(abs(smooth)), D=sum(abs(dx)), M=65535.
// Every horizontal value, vertical product and partial sum is bounded by
// B=2*S*D*M. Its maximum is1207941120 at r4, strictly below INT32_MAX.
// Thus all derivatives and extrema remain exact before normalization.
static int echo16_integer(const uint16_t* rgb,int w,int h,int start,int rows,int radius,int32_t* out,double* limits){
 const int size=2*radius+1;int32_t dx[9],smooth[9];
 for(int i=0;i<size;i++){smooth[i]=int32_t(binomial(size-1,i));dx[i]=int32_t(binomial(size-3,i)-2*binomial(size-3,i-1)+binomial(size-3,i-2));}
 std::vector<int32_t> horizontalX(size_t(w)*h),horizontalY(size_t(w)*h);
 for(int c=0;c<3;c++){
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){
   const int32_t first=rgb[(size_t(y)*w+reflect(x-radius,w))*3+c];int32_t a=dx[0]*first,b=smooth[0]*first;
   for(int k=1;k<size;k++){const int32_t v=rgb[(size_t(y)*w+reflect(x-radius+k,w))*3+c];a+=dx[k]*v;b+=smooth[k]*v;}
   horizontalX[size_t(y)*w+x]=a;horizontalY[size_t(y)*w+x]=b;
  }
  double lo=DBL_MAX,hi=0;
  for(int y=start;y<start+rows;y++)for(int x=0;x<w;x++){
   int32_t a=smooth[radius]*horizontalX[size_t(y)*w+x],b=dx[radius]*horizontalY[size_t(y)*w+x];
   for(int k=1;k<=radius;k++){
    const int above=reflect(y-k,h),below=reflect(y+k,h);
    const int32_t p=horizontalX[size_t(above)*w+x]+horizontalX[size_t(below)*w+x],q=horizontalY[size_t(above)*w+x]+horizontalY[size_t(below)*w+x];
    a+=smooth[radius+k]*p;b+=dx[radius+k]*q;
   }
   const int32_t value=std::abs(a+b);out[(size_t(y-start)*w+x)*3+c]=value;lo=std::min(lo,double(value));hi=std::max(hi,double(value));
  }
  limits[c*2]=lo;limits[c*2+1]=hi;
 }
 return 1;
}

// The large-kernel typed specialization preserves every float32 operation
// and the horizontalFma/vertical std::fma order of the uint8 implementation.
// The rounded float coefficients are integral and <2^28; UInt16 samples are
// integral and <2^16. A product is <2^44 and31 rounded partial sums stay below
//2^50. The double product+sum is therefore exact (<2^53), so the horizontal
// double-then-float optimization remains exactly one float32 FMA rounding.
// No such replacement is made for the vertical products.
static int echo16_float(const uint16_t* rgb,int w,int h,int start,int rows,int radius,float* out,double* limits){
 if(w<1||h<1||start<0||rows<1||start+rows>h||radius<1||radius>15)return 0;
 int size=2*radius+1;float dx[31],smooth[31];
 for(int i=0;i<size;i++){smooth[i]=float(binomial(size-1,i));dx[i]=float(binomial(size-3,i)-2*binomial(size-3,i-1)+binomial(size-3,i-2));}
 std::vector<float> horizontalX(size_t(w)*h),horizontalY(size_t(w)*h);
 for(int c=0;c<3;c++){
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){
   float first=rgb[(size_t(y)*w+reflect(x-radius,w))*3+c],a=dx[0]*first,b=smooth[0]*first;
   for(int k=1;k<size;k++){float v=rgb[(size_t(y)*w+reflect(x-radius+k,w))*3+c];if(radius>=5){a=horizontalFma(dx[k],v,a);b=horizontalFma(smooth[k],v,b);}else{a+=dx[k]*v;b+=smooth[k]*v;}}
   horizontalX[size_t(y)*w+x]=a;horizontalY[size_t(y)*w+x]=b;
  }
  double lo=DBL_MAX,hi=0;
  for(int y=start;y<start+rows;y++){
#if ECHO_OPTIMIZATIONS & 2
   int reflectedAbove[16],reflectedBelow[16];
   for(int k=1;k<=radius;k++){reflectedAbove[k]=reflect(y-k,h);reflectedBelow[k]=reflect(y+k,h);}
#endif
   for(int x=0;x<w;x++){
   float a=smooth[radius]*horizontalX[size_t(y)*w+x],b=dx[radius]*horizontalY[size_t(y)*w+x];
   for(int k=1;k<=radius;k++){
    #if ECHO_OPTIMIZATIONS & 2
    int above=reflectedAbove[k],below=reflectedBelow[k];
#else
    int above=reflect(y-k,h),below=reflect(y+k,h);
#endif
    float p=horizontalX[size_t(above)*w+x]+horizontalX[size_t(below)*w+x],q=horizontalY[size_t(above)*w+x]+horizontalY[size_t(below)*w+x];
    if(radius>=5){a=std::fma(smooth[radius+k],p,a);b=std::fma(dx[radius+k],q,b);}else{a+=smooth[radius+k]*p;b+=dx[radius+k]*q;}
   }
   float value=std::abs(a+b);out[(size_t(y-start)*w+x)*3+c]=value;lo=std::min(lo,double(value));hi=std::max(hi,double(value));
  }}limits[c*2]=lo;limits[c*2+1]=hi;
 }return 1;
}

extern "C" {
int echo_derivatives16(const uint16_t* rgb,int w,int h,int start,int rows,int radius,void* out,double* limits){
 if(!rgb||!out||!limits||w<1||h<1||start<0||rows<1||start>h-rows||radius<1||radius>15)return 0;
 if(radius<=4)return echo16_integer(rgb,w,h,start,rows,radius,static_cast<int32_t*>(out),limits);
 return echo16_float(rgb,w,h,start,rows,radius,static_cast<float*>(out),limits);
}
int echo_render16(const void* values,int n,const double* limits,double total,int radius,int contrast,int grayscale,uint8_t* out){
 if(!values||!limits||!out||n<1||!std::isfinite(total)||total<n||radius<1||radius>15||contrast<0||contrast>100||(grayscale!=0&&grayscale!=1))return 0;
 if(radius>=5){echo_render(static_cast<const float*>(values),n,limits,total,contrast,grayscale,out);return 1;}
 const int32_t* integer=static_cast<const int32_t*>(values);
 uint8_t lut[256];int high=int(contrast/100.*255);for(int i=0;i<256;i++)lut[i]=high==255?255:trunc8(std::clamp((i*-255.)/(-255+high),0.,255.));
 for(int i=0;i<n;i++){
  for(int c=0;c<3;c++){
   const double lo=limits[c*2],span=limits[c*2+1]-lo;
   // Difference and multiplication are exact integers (<2^39). Division is
   // the first float64 rounding, then the existing nearbyint RGB8 quantizer.
   const double value=span>DBL_EPSILON?(double(integer[i*3+c])-lo)*255./span:0.;
   const int rounded=int(std::nearbyint(value));out[i*3+c]=lut[std::clamp(rounded,0,255)];
  }
  if(grayscale){int v=(out[i*3]*9798+out[i*3+1]*19235+out[i*3+2]*3735+16384)>>15;out[i*3]=out[i*3+1]=out[i*3+2]=v;}
 }
 return 1;
}
}
