// Same PyWavelets axis kernels as the qualified whole-frame wrapper. A strip
// always spans the complete transformed axis; boundaries are never tile edges.
#include "wavelets.cpp"
extern "C" {
int wavelet_stream_info(int family,int order,int width,int height){
 try{auto w=wavelet(family,order);output={double(w->dec_len),double(dwt_max_level(std::min(width,height),w->dec_len))};return 1;}catch(...){return 0;}
}
int wavelet_stream_down(const double* values,int width,int height,int family,int order,int axis){
 try{auto w=wavelet(family,order);const size_t rows=axis==0?dwt_buffer_length(height,w->dec_len,MODE_SYMMETRIC):height,cols=axis==1?dwt_buffer_length(width,w->dec_len,MODE_SYMMETRIC):width,n=rows*cols;
  size_t inputShape[2]={size_t(height),size_t(width)},resultShape[2]={rows,cols};pywt_index_t inputStrides[2]={width*8,8},resultStrides[2]={pywt_index_t(cols*8),8};ArrayInfo in{inputShape,inputStrides,2},out{resultShape,resultStrides,2};
  output.resize(n*2+4);output[0]=output[n+2]=rows;output[1]=output[n+3]=cols;
  if(double_downcoef_axis(values,in,output.data()+2,out,w.get(),axis,COEF_APPROX,MODE_SYMMETRIC,0,DWT_TRANSFORM)||double_downcoef_axis(values,in,output.data()+n+4,out,w.get(),axis,COEF_DETAIL,MODE_SYMMETRIC,0,DWT_TRANSFORM))throw std::runtime_error("dwt");return 1;
 }catch(...){output.clear();return 0;}
}
int wavelet_stream_up(const double* av,const double* dv,int width,int height,int family,int order,int axis){
 try{auto w=wavelet(family,order);const size_t rows=axis==0?idwt_buffer_length(height,w->rec_len,MODE_SYMMETRIC):height,cols=axis==1?idwt_buffer_length(width,w->rec_len,MODE_SYMMETRIC):width;
  size_t inputShape[2]={size_t(height),size_t(width)},resultShape[2]={rows,cols};pywt_index_t inputStrides[2]={width*8,8},resultStrides[2]={pywt_index_t(cols*8),8};ArrayInfo in{inputShape,inputStrides,2},out{resultShape,resultStrides,2};
  // The PyWavelets IDWT kernel adds into its destination. Reinitialization is
  // required even when the preceding strip left the output vector this size.
  output.assign(rows*cols+2,0.);output[0]=rows;output[1]=cols;
  if(double_idwt_axis(av,&in,dv,&in,output.data()+2,out,w.get(),axis,MODE_SYMMETRIC))throw std::runtime_error("idwt");return 1;
 }catch(...){output.clear();return 0;}
}
void wavelet_stream_threshold(double* p,int n,double maximum,int percent,int mode){
 if(maximum==0||percent==0)return;const double value=(percent/100.)*maximum,square=value*value;
 for(int i=0;i<n;i++){double& x=p[i];double magnitude=std::abs(x);switch(mode){
 case 0:{double factor=1-value/magnitude;x*=factor<0?0:factor;break;}
 case 1:if(magnitude<value)x=0;break;
 case 2:{double factor=1-square/(magnitude*magnitude);x*=factor<0?0:factor;break;}
 case 3:if(x<value)x=0;break;
 case 4:if(x>value)x=0;break;
 }}
}
// Threshold the owned input strips after their one upload. Arithmetic and
// per-band maxima are unchanged; the cached decomposition is never mutated.
int wavelet_stream_up_threshold(double* av,double* dv,int width,int height,int family,int order,int axis,int thresholdA,int thresholdD,double maximumA,double maximumD,int percent,int mode){
 if(thresholdA)wavelet_stream_threshold(av,width*height,maximumA,percent,mode);
 if(thresholdD)wavelet_stream_threshold(dv,width*height,maximumD,percent,mode);
 return wavelet_stream_up(av,dv,width,height,family,order,axis);
}

}

extern "C" void wavelet_stream_normalize(const double* values,int count,double lo,double hi,int total,unsigned char* out){
 double scale=hi-lo>2.220446049250313e-16?255.*(1./(hi-lo)):0.;float a=scale,b=-lo*scale;
 for(int i=0;i<count;i++){double v=total>=8?double(std::fma(float(values[i]),a,b)):std::fma(values[i],double(a),double(b));int rounded=std::nearbyint(v);out[i]=std::max(0,std::min(255,rounded));}
}

// Same native CV8U affine step with explicitly enclosed scale/bias. This API
// certifies a GPU noise interval; it does not replace the native normalization.
extern "C" void wavelet_stream_affine(const double* values,int count,float a,float b,int total,unsigned char* out){
 for(int i=0;i<count;i++){double v=total>=8?double(std::fma(float(values[i]),a,b)):std::fma(values[i],double(a),double(b));int rounded=std::nearbyint(v);out[i]=std::max(0,std::min(255,rounded));}
}

// Exact same native detail stencil, without allocating/computing an unused
// approximation band for db8 block-noise analysis or its point refinements.
extern "C" int wavelet_stream_detail(const double* values,int width,int height,int family,int order,int axis){
 try{auto w=wavelet(family,order);Plane in(height,width);std::copy_n(values,width*height,in.data.begin());auto d=down(in,w.get(),axis,COEF_DETAIL);output.clear();append(d);return 1;}catch(...){output.clear();return 0;}
}

// Exact selected pixels of the complete final IDWT. This follows the native
// separable order (horizontal low/high sums, then vertical low/high sums).
// It repairs display-boundary ambiguities reported by the optional GPU path.
extern "C" int wavelet_stream_final_pixels(const double* a,const double* h,const double* v,const double* d,int width,int height,int family,int order,const unsigned int* indices,int count,int targetWidth){
 try{auto w=wavelet(family,order);const int filter=w->rec_len,half=filter/2,ow=2*width-filter+2,oh=2*height-filter+2;
  if(count<0||targetWidth<1||targetWidth>ow)throw std::runtime_error("crop");output.assign(count,0.);
  const auto horizontal=[&](const double* low,const double* high,int row,int x){double lo=0.,hi=0.;const int at=x/2+half-1,parity=x%2;
   for(int j=0;j<half;j++){const int k=j*2+parity,index=row*width+at-j;lo+=w->rec_lo_double[k]*low[index];hi+=w->rec_hi_double[k]*high[index];}return (0.+lo)+hi;};
  for(int at=0;at<count;at++){const unsigned int pixel=indices[at];const int y=pixel/targetWidth,x=pixel%targetWidth;if(y>=oh)throw std::runtime_error("pixel");double lo=0.,hi=0.;const int row=y/2+half-1,parity=y%2;
   for(int j=0;j<half;j++){const int k=j*2+parity;lo+=w->rec_lo_double[k]*horizontal(a,v,row-j,x);hi+=w->rec_hi_double[k]*horizontal(h,d,row-j,x);}output[at]=(0.+lo)+hi;
  }return 1;
 }catch(...){output.clear();return 0;}
}
