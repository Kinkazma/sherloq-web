// Exact staged luminance gradient; coefficients and arithmetic match the
// qualified OpenCV/native reference. No normalization is local to a strip.
#include <algorithm>
#include <cfloat>
#include <cmath>
#include <cstdint>
#include <vector>
#ifndef GRADIENT_OPTIMIZATIONS
#define GRADIENT_OPTIMIZATIONS 0
#endif
static uint8_t trunc8(double v){return uint8_t(int64_t(std::trunc(v))&255);}
static int reflect(int i,int n){return n==1?0:i<0?-i:i>=n?2*n-i-2:i;}
static uint8_t direction(int16_t v,double maximum,bool invert){
 if(!maximum)return 127;float x=invert?-float(v):float(v);return trunc8((x/float(maximum)*127.f)+127.f);
}
static const uint8_t* directionTables(const double* stats,bool invert){
 static uint8_t tables[4082];static double mx=-1,my=-1;static bool reversed=false;
 if(mx!=stats[0]||my!=stats[1]||reversed!=invert){for(int v=-1020;v<=1020;v++){tables[v+1020]=direction(v,stats[0],invert);tables[2041+v+1020]=direction(v,stats[1],invert);}mx=stats[0];my=stats[1];reversed=invert;}return tables;
}
static uint8_t directionValue(int16_t value,int channel,const double* stats,bool invert,const uint8_t* tables){return tables&&value>=-1020&&value<=1020?tables[channel*2041+value+1020]:direction(value,stats[channel],invert);}
static const uint8_t* lengthTable(double scale,double shift,bool fused){
 static uint8_t table[65536];static double previousScale=-1,previousShift=0;static bool previousFused=false;
 if(scale!=previousScale||shift!=previousShift||fused!=previousFused){for(int r=0;r<256;r++)for(int g=0;g<256;g++){double value=std::sqrt(double(r)*r+double(g)*g);table[r*256+g]=trunc8(fused?std::fma(value,scale,shift):value*scale+shift);}previousScale=scale;previousShift=shift;previousFused=fused;}return table;
}
extern "C" {
// RGB window includes at most one halo row on each side. Only core rows count.
int gradient_derivatives(const uint8_t* rgb,int w,int h,int start,int rows,int16_t* out,double* stats){
 if(w<1||h<1||start<0||rows<1||start+rows>h)return 0;
 std::vector<uint8_t> gray(size_t(w)*h);for(size_t i=0;i<gray.size();i++)gray[i]=(rgb[i*3]*9798+rgb[i*3+1]*19235+rgb[i*3+2]*3735+16384)>>15;
 double mx=0,my=0,lo=DBL_MAX,hi=0;
 for(int y=start;y<start+rows;y++)for(int x=0;x<w;x++){
  int a=reflect(x-1,w),b=reflect(x+1,w),t=reflect(y-1,h),u=reflect(y+1,h);
  int dx=gray[t*w+b]+2*gray[y*w+b]+gray[u*w+b]-gray[t*w+a]-2*gray[y*w+a]-gray[u*w+a];
  int dy=gray[u*w+a]+2*gray[u*w+x]+gray[u*w+b]-gray[t*w+a]-2*gray[t*w+x]-gray[t*w+b];
  size_t i=(size_t(y-start)*w+x)*2;out[i]=dx;out[i+1]=dy;mx=std::max(mx,double(std::abs(dx)));my=std::max(my,double(std::abs(dy)));double m=std::abs(dx)+std::abs(dy);lo=std::min(lo,m);hi=std::max(hi,m);
 }stats[0]=mx;stats[1]=my;stats[2]=lo;stats[3]=hi;return 1;
}
void gradient_lengths(const int16_t* slopes,int n,const double* stats,int invert,double* limits){
 const uint8_t* tables=GRADIENT_OPTIMIZATIONS&2?directionTables(stats,invert):nullptr;
 double lo=DBL_MAX,hi=0;for(int i=0;i<n;i++){double r=directionValue(slopes[i*2],0,stats,invert,tables),g=directionValue(slopes[i*2+1],1,stats,invert,tables),v=r*r+g*g;if(!(GRADIENT_OPTIMIZATIONS&4))v=std::sqrt(v);lo=std::min(lo,v);hi=std::max(hi,v);}limits[0]=GRADIENT_OPTIMIZATIONS&4?std::sqrt(lo):lo;limits[1]=GRADIENT_OPTIMIZATIONS&4?std::sqrt(hi):hi;
}
void gradient_render(const int16_t* slopes,int n,const double* stats,int mode,int invert,double total,uint8_t* out,uint32_t* histogram){
 std::fill(histogram,histogram+768,0);
 double scale=stats[5]-stats[4]>DBL_EPSILON?255.*(1./(stats[5]-stats[4])):0.,shift=-stats[4]*scale;
 float magnitudeScale=float(stats[3]-stats[2]>DBL_EPSILON?255.*(1./(stats[3]-stats[2])):0.),magnitudeShift=-float(stats[2]*double(magnitudeScale));
 const uint8_t* directions=GRADIENT_OPTIMIZATIONS&2?directionTables(stats,invert):nullptr;
 const uint8_t* lengths=mode==3&&(GRADIENT_OPTIMIZATIONS&1)?lengthTable(scale,shift,total>=4):nullptr;
 for(int i=0;i<n;i++){
  uint8_t r=directionValue(slopes[i*2],0,stats,invert,directions),g=directionValue(slopes[i*2+1],1,stats,invert,directions),b=0;
  if(mode==1)b=255;
  else if(mode==2){float value=std::abs(int(slopes[i*2]))+std::abs(int(slopes[i*2+1]));b=trunc8(value*magnitudeScale+magnitudeShift);}
  else if(mode==3){if(lengths)b=lengths[int(r)*256+g];else{double value=std::sqrt(double(r)*r+double(g)*g);b=trunc8(total>=4?std::fma(value,scale,shift):value*scale+shift);}}
  out[i*3]=r;out[i*3+1]=g;out[i*3+2]=b;histogram[r]++;histogram[256+g]++;histogram[512+b]++;
 }
}
void gradient_lut(uint8_t* rgb,int n,const uint8_t* lut){for(int i=0;i<n;i++)for(int c=0;c<3;c++)rgb[i*3+c]=lut[c*256+rgb[i*3+c]];}
}
