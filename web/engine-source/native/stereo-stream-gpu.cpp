#define SHERLOQ_STEREO_GPU 1
#include <opencv2/core.hpp>
#include <emscripten/emscripten.h>
#include <stdexcept>
EM_JS(int,stereoResidentGpuAvailable,(),{return Module.gpuGaussian?1:0;});
EM_ASYNC_JS(int,stereoResidentGpuBlur,(int input,int output,int width,int height,int size,int kernel,int kind),{
 try{return await Module.gpuGaussian(input,output,width,height,size,kernel,kind)?1:0;}
 catch(error){Module.ioError=error;return -1;}
});
EM_JS(void,stereoResidentCpuObserved,(int width,int height,int size,int kind,double ms),{Module.cpuGaussianObserved?.(width,height,size,kind,ms);});
namespace cv {
void sherloqStereoCpuBlurObserved(int width,int height,int size,int kind,double ms){stereoResidentCpuObserved(width,height,size,kind,ms);}
bool sherloqStereoGpuBlur(const Mat&input,Mat&output,int size,const float*kernel,int kind){
 if(!stereoResidentGpuAvailable()||!input.isContinuous())return false;
 output.create(input.size(),input.type());if(!output.isContinuous())return false;
 const int done=stereoResidentGpuBlur(reinterpret_cast<intptr_t>(input.ptr<float>()),reinterpret_cast<intptr_t>(output.ptr<float>()),input.cols,input.rows,size,reinterpret_cast<intptr_t>(kernel),kind);
 if(done<0)throw std::runtime_error("Resident Gaussian transport failed");
 return done!=0;
}
}
#include "stereo-stream.cpp"
