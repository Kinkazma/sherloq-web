// OpenCV 4.11 exp32f polynomial/table, with native fused float arithmetic.
// modules/core/src/mathfuncs_core.simd.hpp (OpenCV Apache-2.0).
#include <opencv2/core.hpp>
#include <cmath>
#include <cstring>
namespace cv { namespace details { const float* getExpTab32f(); } }
static void siftNativeExp(const float* source,float* destination,int count){
 constexpr double a0=.9670371139572337719125840413672004409288e-2;
 const float a4=float(1.000000000000002438532970795181890933776/a0),a3=float(.6931471805521448196800669615864773144641/a0),a2=float(.2402265109513301490103372422686535526573/a0),a1=float(.5550339366753125211915322047004666939128e-1/a0);
 const float prescale=float(1.4426950408889634073599246810019*64),maximum=float(3000/(1.4426950408889634073599246810019));
 const float* table=cv::details::getExpTab32f();
 for(int i=0;i<count;i++){
  float x=std::min(std::max(source[i],-maximum),maximum)*prescale;int index=cvRound(x);x=(x-index)*(1.f/64);
  uint32_t exponent=uint32_t(std::max(0,std::min(255,(index>>6)+127)))<<23;float scale;std::memcpy(&scale,&exponent,4);
  float polynomial=std::fma(std::fma(std::fma(x+a1,x,a2),x,a3),x,a4);
  destination[i]=(scale*table[index&63])*polynomial;
 }
}
