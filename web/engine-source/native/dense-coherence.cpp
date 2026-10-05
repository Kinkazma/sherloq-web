// Port of core/dense_copy.py coherent_mask. GPL-3.0-or-later.
// Integer displacement/filter sums are exact before the binary64 residual.
#include <cmath>
#include <cstdint>
#include <cstring>
extern "C" int sherloq_dense_area_filter(unsigned char*,int,int,int,int(*)(),char*);
extern "C" int sherloq_dense_coherence(const int* targets,const float* squared,
 int width,int height,float threshold_squared,double error_threshold,int radius,
 int minimum,unsigned char* selected,float* errors,char* error) {
 if(width<=0||height<=0||int64_t(width)*height>INT32_MAX||radius<1||radius>6||minimum<1){
  std::strcpy(error,"Invalid dense coherence settings");return -1;
 }
 int count=0,moment=0;
 for(int y=-radius;y<=radius;++y)for(int x=-radius;x<=radius;++x)if(x*x+y*y<=radius*radius){++count;moment+=x*x;}
 for(int y=0;y<height;++y)for(int x=0;x<width;++x){
  double sx=0,sy=0,sxx=0,syy=0,lxx=0,lxy=0,lyx=0,lyy=0;int valid=0;
  for(int dy=-radius;dy<=radius;++dy){
   const int yy=y+dy;if(yy<0||yy>=height)continue;
   for(int dx=-radius;dx<=radius;++dx){
    if(dx*dx+dy*dy>radius*radius)continue;
    const int xx=x+dx;if(xx<0||xx>=width)continue;
    const int i=yy*width+xx,t=targets[i];
    if(t<0||t>=width*height||squared[i]>threshold_squared)continue;
    ++valid;
    const double a=t%width-xx,b=t/width-yy;
    sx+=a;sy+=b;sxx+=a*a;syy+=b*b;
    lxx+=a*dx;lxy+=a*dy;lyx+=b*dx;lyy+=b*dy;
   }
  }
  double residual=0;
  residual+=sxx-sx*sx/count;residual-=lxx*lxx/moment;residual-=lxy*lxy/moment;
  residual+=syy-sy*sy/count;residual-=lyx*lyx/moment;residual-=lyy*lyy/moment;
  const double e=std::sqrt((residual>0?residual:0)/count);
  const int i=y*width+x;errors[i]=float(e);selected[i]=(valid==count&&e<=error_threshold)?1:0;
 }
 return sherloq_dense_area_filter(selected,width,height,minimum,nullptr,error);
}
