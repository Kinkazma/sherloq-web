#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <new>

struct Pack {
 uint32_t n,e,words,at=0,phase=0,unique=0;int prior=-1,rank=-1;
 double pixels,gain,median,weak,dualScale,sum=0,strong=INFINITY,info[4]{};
 const uint32_t *low,*high;const double *difference,*multiplicity,*counts;const uint16_t *levels;
 float *nodes,*states;uint32_t *ptr,*adj,*edges,*order,*histogram,*cursor;double *weights;
 Pack(uint32_t nn,uint32_t ee,double N,double g,double med,double wk,double ds,uint32_t packed,const uint32_t*lo,const uint32_t*hi,const double*d,const double*mult,const double*ct,const uint16_t*lev,float*nd,uint32_t*pp,uint32_t*aa,uint32_t*ed,float*st,double*ww,uint32_t*oo,uint32_t*hh,uint32_t*cc):n(nn),e(ee),words(packed?5:6),pixels(N),gain(g),median(med),weak(wk),dualScale(ds),low(lo),high(hi),difference(d),multiplicity(mult),counts(ct),levels(lev),nodes(nd),states(st),ptr(pp),adj(aa),edges(ed),order(oo),histogram(hh),cursor(cc),weights(ww){std::fill(histogram,histogram+65537,0);}
 void putFloat(uint32_t at,double value){float f=float(value);uint32_t bits;std::memcpy(&bits,&f,4);edges[at]=bits;}
 int step(uint32_t work){
  while(work&&phase<11){
   if(phase==0){while(at<=n&&work){ptr[at++]=0;work--;}if(at>n){at=0;phase=1;}}
   else if(phase==1){
    while(at<e&&work){double d=difference[at],m=multiplicity[at];if(low[at]>=n||high[at]>=n||!(d>0)||!std::isfinite(d)||!(m>0)||!std::isfinite(m))return -3;weights[at]=m*sqrt(d/(d+median));sum+=weights[at];at++;work--;}
    if(at==e){at=0;phase=2;}
   }else if(phase==2){
    while(at<e&&work){
     weights[at]/=sum;double d=difference[at],t=gain*d/(1+(gain-1)*d),f=20*weights[at]/(1+pow(d/(8*weak),4))/(t*t);
     uint32_t base=words*at,offset=words==5?1:2;
     if(words==5)edges[base]=low[at]|(high[at]<<16);else{edges[base]=low[at];edges[base+1]=high[at];}
     putFloat(base+offset,.1*d);putFloat(base+offset+1,pixels*weights[at]);putFloat(base+offset+2,pixels*f);putFloat(base+offset+3,t);
     ptr[low[at]+1]++;ptr[high[at]+1]++;at++;work--;
    }
    if(at==e){at=0;phase=3;}
   }else if(phase==3){while(at<n&&work){histogram[uint32_t(levels[at])+1]++;at++;work--;}if(at==n){at=0;phase=4;}}
   else if(phase==4){while(at<65536&&work){histogram[at+1]+=histogram[at];at++;work--;}if(at==65536){at=0;phase=5;}}
   else if(phase==5){while(at<n&&work){order[histogram[levels[at]]++]=at;at++;work--;}if(at==n){at=0;phase=6;prior=-1;}}
   else if(phase==6){while(at<n&&work){int value=levels[order[at]];if(value!=prior){prior=value;unique++;}at++;work--;}if(at==n){at=0;phase=7;prior=-1;rank=-1;if(unique<2)return -3;}}
   else if(phase==7){
    while(at<n&&work){uint32_t i=order[at];int value=levels[i];if(value!=prior){prior=value;rank++;}double start=.1*(double(value)/65535.)+.9*(.01+.98*rank/(unique-1));states[2*i]=states[2*i+1]=float(start);at++;work--;}
    if(at==n){at=0;phase=8;}
   }else if(phase==8){
    while(at<n&&work){if(!(counts[at]>0)||!std::isfinite(counts[at]))return -3;uint32_t degree=ptr[at+1];ptr[at+1]+=ptr[at];nodes[2*at]=float(.1*counts[at]);nodes[2*at+1]=float(.99/(dualScale*std::max(degree,1U)));strong=std::min(strong,.8*counts[at]*double(nodes[2*at+1]));at++;work--;}
    if(at==n){at=0;phase=9;}
   }else if(phase==9){while(at<=n&&work){cursor[at]=ptr[at];at++;work--;}if(at>n){at=0;phase=10;}}
   else if(phase==10){while(at<e&&work){adj[cursor[low[at]]++]=2*at;adj[cursor[high[at]]++]=2*at+1;at++;work--;}if(at==e)phase=11;}
  }
  return phase==11?1:0;
 }
};
extern "C" {
uintptr_t gpu_pack_create(uint32_t n,uint32_t e,double pixels,double gain,double median,double weak,double dualScale,uint32_t packed,const uint32_t*low,const uint32_t*high,const double*d,const double*mult,const double*counts,const uint16_t*levels,float*nodes,uint32_t*ptr,uint32_t*adj,uint32_t*edges,float*states,double*weights,uint32_t*order,uint32_t*histogram,uint32_t*cursor){
 if(!n||!e||!low||!high||!d||!mult||!counts||!levels||!(pixels>0)||!(gain>0)||!(median>0)||!(weak>0)||!(dualScale>0)||packed&&n>65536)return 0;
 return reinterpret_cast<uintptr_t>(new(std::nothrow) Pack(n,e,pixels,gain,median,weak,dualScale,packed,low,high,d,mult,counts,levels,nodes,ptr,adj,edges,states,weights,order,histogram,cursor));
}
int gpu_pack_step(Pack*p,uint32_t work){return p->step(std::max(1U,work));}
const double*gpu_pack_info(Pack*p){p->info[0]=p->phase;p->info[1]=p->strong;p->info[2]=p->gain;p->info[3]=p->unique;return p->info;}
void gpu_pack_destroy(Pack*p){delete p;}
}
