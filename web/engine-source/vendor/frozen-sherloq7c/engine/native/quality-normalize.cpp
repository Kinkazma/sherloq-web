// Pinned native cv.normalize(float64, 0, 1, NORM_MINMAX) arithmetic for the
// 100 quality-curve samples. Native fused rounding must precede the model cast.
#include <cmath>
#include <cfloat>
#include <algorithm>
extern "C" int quality_normalize(const double* input,double* output,int length){
 if(length!=100)return 0;
 double low=input[0],high=input[0];
 for(int i=0;i<length;i++){if(!std::isfinite(input[i]))return 0;low=std::min(low,input[i]);high=std::max(high,input[i]);}
 const double scale=high-low>DBL_EPSILON?1./(high-low):0.,shift=0.-low*scale;
 for(int i=0;i<length;i++)output[i]=std::fma(input[i],scale,shift);
 return 1;
}
