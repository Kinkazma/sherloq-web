// Same PyWavelets axis kernels as the qualified whole-frame wrapper. A strip
// always spans the complete transformed axis; boundaries are never tile edges.
#include "wavelets.cpp"
extern "C" {
int wavelet_stream_info(int family,int order,int width,int height){
 try{auto w=wavelet(family,order);output={double(w->dec_len),double(dwt_max_level(std::min(width,height),w->dec_len))};return 1;}catch(...){return 0;}
}
int wavelet_stream_down(const double* values,int width,int height,int family,int order,int axis){
 try{auto w=wavelet(family,order);Plane in(height,width);std::copy_n(values,width*height,in.data.begin());auto a=down(in,w.get(),axis,COEF_APPROX),d=down(in,w.get(),axis,COEF_DETAIL);output.clear();append(a);append(d);return 1;}catch(...){output.clear();return 0;}
}
int wavelet_stream_up(const double* av,const double* dv,int width,int height,int family,int order,int axis){
 try{auto w=wavelet(family,order);Plane a(height,width),d(height,width);std::copy_n(av,width*height,a.data.begin());std::copy_n(dv,width*height,d.data.begin());auto p=up(a,d,w.get(),axis);output.clear();append(p);return 1;}catch(...){output.clear();return 0;}
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
}

extern "C" void wavelet_stream_normalize(const double* values,int count,double lo,double hi,int total,unsigned char* out){
 double scale=hi-lo>2.220446049250313e-16?255.*(1./(hi-lo)):0.;float a=scale,b=-lo*scale;
 for(int i=0;i<count;i++){double v=total>=8?double(std::fma(float(values[i]),a,b)):std::fma(values[i],double(a),double(b));int rounded=std::nearbyint(v);out[i]=std::max(0,std::min(255,rounded));}
}
