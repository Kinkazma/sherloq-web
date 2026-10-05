// Uses the separately qualified signed SLEEF expression retained by DLF.
// Fixed contiguous vector-domain float32 inputs, not a generic Torch scalar tail.
#include "dlf.cpp"
extern "C" int d2prl_sigmoid_values(const float* input,int count,float* output){
 if(count<1||count%8)return 0;
 for(int i=0;i<count;i++)output[i]=1.f/(1.f+exp_signed(-input[i]));
 return 1;
}
