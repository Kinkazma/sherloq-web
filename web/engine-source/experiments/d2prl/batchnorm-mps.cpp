// Explicit empirically qualified MPS BatchNorm evaluation order. Each named
// float intermediate rounds separately; compile with -ffp-contract=off.
#include <cmath>
#include <algorithm>
extern "C" int d2prl_mps_batchnorm(const float* input,const float* mean,const float* variance,const float* gamma,const float* beta,int channels,int plane,float epsilon,int relu,float* output){
 if(!input||!mean||!variance||!gamma||!beta||!output||channels<1||channels>2048||plane<1||plane>2404*2404||!std::isfinite(epsilon)||epsilon<=0||(relu!=0&&relu!=1))return 0;
 for(int c=0;c<channels;c++){
  if(!std::isfinite(mean[c])||!std::isfinite(variance[c])||variance[c]<0||!std::isfinite(gamma[c])||!std::isfinite(beta[c]))return 0;
  const float den=variance[c]+epsilon,inv=static_cast<float>(1.0/std::sqrt(static_cast<double>(den)));
  for(int i=0;i<plane;i++){
   const float delta=input[c*plane+i]-mean[c],norm=delta*inv,scaled=norm*gamma[c],value=scaled+beta[c];
   output[c*plane+i]=relu?std::max(value,0.f):value;
  }
 }
 return 1;
}
