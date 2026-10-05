// Global XFeat NMS and original PyTorch grid_sample coordinate conventions.
#include <cmath>
#include <algorithm>
#include <vector>
#include <numeric>
static float coord(float g,int size){return ((g+1.f)*size-1.f)*.5f;}
static float grid(int p,int size){return 2.f*(float(p)/float(size-1))-1.f;}
extern "C" int xfeat_candidates(const float* heat,int heatFirst,int width,int height,int first,int rows,const float* reliability,float* output){
 const int rw=width/8,rh=height/8;int count=0;
 auto value=[&](int y,int x){return x<0||x>=width||y<0||y>=height?0.f:heat[(y-heatFirst)*width+x];};
 auto rel=[&](int y,int x){return x<0||x>=rw||y<0||y>=rh?0.f:reliability[y*rw+x];};
 for(int y=first;y<first+rows;y++)for(int x=0;x<width;x++){
  float v=value(y,x);if(v<=.05f)continue;bool maximum=true;
  for(int dy=-2;dy<=2&&maximum;dy++)for(int dx=-2;dx<=2;dx++)if(y+dy>=0&&y+dy<height&&x+dx>=0&&x+dx<width&&value(y+dy,x+dx)>v){maximum=false;break;}
  if(!maximum)continue;
  const float gx=grid(x,width),gy=grid(y,height),fx=coord(gx,rw),fy=coord(gy,rh);const int x0=int(std::floor(fx)),y0=int(std::floor(fy));
  float nw=(x0+1-fx)*(y0+1-fy),ne=(fx-x0)*(y0+1-fy),sw=(x0+1-fx)*(fy-y0),se=(fx-x0)*(fy-y0);
  float score=0;score+=rel(y0,x0)*nw;score+=rel(y0,x0+1)*ne;score+=rel(y0+1,x0)*sw;score+=rel(y0+1,x0+1)*se;
  score*=value(int(std::nearbyint(coord(gy,height))),int(std::nearbyint(coord(gx,width))));
  if(!x&&!y)score=-1;output[count*3]=x;output[count*3+1]=y;output[count*3+2]=score;count++;
 }
 return count;
}
extern "C" int xfeat_order(const float* rows,int count,int limit,int* out){
 try{std::vector<int> ids(count);std::iota(ids.begin(),ids.end(),0);std::sort(ids.begin(),ids.end(),[&](int a,int b){return rows[a*3+2]>rows[b*3+2];});int n=std::min(count,limit);std::copy(ids.begin(),ids.begin()+n,out);return n;}catch(...){return -1;}
}
static float cubic1(float x){return ((-.75f+2.f)*x-(-.75f+3.f))*x*x+1.f;}
static float cubic2(float x){return ((-.75f*x-5.f*-.75f)*x+8.f*-.75f)*x-4.f*-.75f;}
static void coefficients(float t,float* out){out[0]=cubic2(t+1.f);out[1]=cubic1(t);out[2]=cubic1(1.f-t);out[3]=cubic2(2.f-t);}
extern "C" void xfeat_sample_location(int x,int y,int width,int height,int* out){out[0]=int(std::floor(coord(grid(x,width),width/8)));out[1]=int(std::floor(coord(grid(y,height),height/8)));}
extern "C" void xfeat_sample(const float* patch,int x,int y,int width,int height,float* output){
 float fx=coord(grid(x,width),width/8),fy=coord(grid(y,height),height/8),cx[4],cy[4];coefficients(fx-std::floor(fx),cx);coefficients(fy-std::floor(fy),cy);
 float sum=0;for(int c=0;c<64;c++){float rows[4];for(int j=0;j<4;j++)rows[j]=((patch[(j*4)*64+c]*cx[0]+patch[(j*4+1)*64+c]*cx[1])+patch[(j*4+2)*64+c]*cx[2])+patch[(j*4+3)*64+c]*cx[3];float v=((rows[0]*cy[0]+rows[1]*cy[1])+rows[2]*cy[2])+rows[3]*cy[3];output[c]=v;sum+=v*v;}
 float norm=std::max(std::sqrt(sum),1e-12f);for(int c=0;c<64;c++)output[c]/=norm;
}
// Original align_corners=False bilinear RGB resize followed by channel mean.
extern "C" int xfeat_source_row(int y,int height,int resized){float scale=float(double(height)/resized);float sy=std::max(0.f,std::fma(scale,y+.5f,-.5f));return std::min(int(sy),height-1);}
extern "C" void xfeat_gray_row(const unsigned char* row0,const unsigned char* row1,int width,int height,int resizedWidth,int resizedHeight,int y,float* out){
 if(width==resizedWidth&&height==resizedHeight){for(int x=0;x<width;x++)out[x]=float(int(row0[x*3])+int(row0[x*3+1])+int(row0[x*3+2]))/3.f;return;}
 float hy=std::max(0.f,std::fma(float(double(height)/resizedHeight),y+.5f,-.5f)),wy=hy-int(hy),scale=float(double(width)/resizedWidth);
 for(int x=0;x<resizedWidth;x++){float hx=std::max(0.f,std::fma(scale,x+.5f,-.5f)),wx=hx-int(hx);int x0=std::min(int(hx),width-1),x1=std::min(x0+1,width-1);float ch[3];for(int c=0;c<3;c++)ch[c]=(1-wy)*((1-wx)*row0[x0*3+c]+wx*row0[x1*3+c])+wy*((1-wx)*row1[x0*3+c]+wx*row1[x1*3+c]);out[x]=((ch[2]+ch[1])+ch[0])/3.f;}
}
