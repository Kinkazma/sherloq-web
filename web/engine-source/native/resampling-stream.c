// Same NumPy 1.26 complex-axis kernel and OpenCV pyrUp arithmetic as the
// existing adapter. Callers gather complete axes, never independent tile FFTs.
#include "resampling-math.c"
int resampling_stream_axis(const double* input,double* output,int length,int lines,int real){
 if(length<1||length>16384||lines<1)return 0;
 cfft_plan plan=make_cfft_plan(length);if(!plan)return 0;int ok=1;
 for(int row=0;row<lines;row++){
  double* target=output+2*(size_t)row*length;
  if(real)for(int x=0;x<length;x++){target[2*x]=input[(size_t)row*length+x];target[2*x+1]=0;}
  else memcpy(target,input+2*(size_t)row*length,2*(size_t)length*sizeof(double));
  if(cfft_forward(plan,target,1)){ok=0;break;}
 }
 destroy_cfft_plan(plan);return ok;
}
