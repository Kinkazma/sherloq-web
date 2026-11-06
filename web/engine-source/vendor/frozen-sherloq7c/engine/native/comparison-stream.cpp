// Dedicated global comparison stages. Inputs arrive in bands, in oriented BGR.
// The original global algorithms are retained; no independent image tiling.
#include "../.build/comparison-primitives.h"
#include "frequency.h"
#include "contrast.h"
#include "stereo.h"
#include "comparison.h"
#include "comparison-fma.h"
#include "comparison-simd.h"
#include "comparison-sewar.h"
#include "comparison-helpers.h"
#include "../.build/comparison-ssimulacra.h"
#include "../.build/comparison-butteraugli.h"
static cv::Mat comparisonInputs[2];
extern "C" {
int comparison_stream_create(int width,int height){try{if(width<1||height<1||int64_t(width)*height>INT32_MAX/3)return 0;comparisonInputs[0].create(height,width,CV_8UC3);comparisonInputs[1].create(height,width,CV_8UC3);return 1;}catch(...){comparisonInputs[0].release();comparisonInputs[1].release();return 0;}}
unsigned char* comparison_stream_input(int index){return index>=0&&index<2?comparisonInputs[index].data:nullptr;}
int comparison_stream_run(int mode,int view,int original){try{comparisonFastArithmetic=!original;comparisonContiguous=!original;const auto&a=comparisonInputs[0];const auto&b=comparisonInputs[1];comparisonScore=0;
 if(mode==6){output=comparisonSsim(a,b);}
 else if(mode==1){output=comparisonSsim(a,b);if(view){auto normalized=norm(output);cv::bitwise_not(normalized,normalized);cv::cvtColor(normalized,output,cv::COLOR_GRAY2RGB);}else output.release();}
 else if(mode==2)output=comparisonHistograms(a,b);
 else if(mode==3)output=comparisonSewar(a,b);
 else if(mode==4){output=comparisonButteraugli::compute(a,b);if(!view)output.release();}
 else if(mode==5)output=cv::Mat(1,1,CV_64F,cv::Scalar(comparisonSsimulacra::compute(a,b)));
 else return 0;
 comparisonInputs[0].release();comparisonInputs[1].release();return 1;
 }catch(...){output.release();return 0;}}
double comparison_stream_score(){return comparisonScore;}
const unsigned char* comparison_stream_output(){return output.data;}
int comparison_stream_bytes(){return output.total()*output.elemSize();}
void comparison_stream_release(){output.release();comparisonInputs[0].release();comparisonInputs[1].release();}
}
