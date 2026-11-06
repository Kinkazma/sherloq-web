/* Private ZERO region prototype. AGPL-3.0-or-later; derived from ZERO/IPOL390.
 * Membership is the identical radius-nine, same-grid graph. Word sets only
 * accelerate enumeration of undiscovered members; no numerical reduction is
 * reordered. Seeds retain the original x-major order. The closing deliberately
 * retains ZERO's unusual interior-centre border rule, including prefilled output.
 */
#include <stdlib.h>
#include <stdint.h>
#include <math.h>
#include <string.h>
#include "zero.h"

static void horizontal(const int *src,int *dst,int X,int Y,int second){
 for(int y=0;y<Y;y++){
  int sum=0,allowed=y>=9&&y<Y-9;
  for(int x=0;x<X;x++){
   if(x==0){for(int xx=0;xx<=9&&xx<X;xx++)if(allowed&&xx>=9&&xx<X-9)sum+=second?src[y*X+xx]==0:src[y*X+xx]!=0;}
   else if(allowed){int add=x+9,remove=x-10;if(add>=9&&add<X-9)sum+=second?src[y*X+add]==0:src[y*X+add]!=0;if(remove>=9&&remove<X-9)sum-=second?src[y*X+remove]==0:src[y*X+remove]!=0;}
   dst[y*X+x]=sum>0;
  }
 }
}

/* Two N-int scratch planes, with no allocation. They may be reused after BFS. */
void zero_fast_closing(const int *mask,int *reg,int *scratch,int *dilation,int X,int Y){
 horizontal(mask,scratch,X,Y,0);
 for(int x=0;x<X;x++){
  int sum=0;for(int yy=0;yy<=9&&yy<Y;yy++)sum+=scratch[yy*X+x];
  for(int y=0;y<Y;y++){
   if(y){int add=y+9,remove=y-10;if(add<Y)sum+=scratch[add*X+x];if(remove>=0)sum-=scratch[remove*X+x];}
   dilation[y*X+x]=sum>0;
  }
 }
 horizontal(dilation,scratch,X,Y,1);
 for(int x=0;x<X;x++){
  int sum=0;for(int yy=0;yy<=9&&yy<Y;yy++)sum+=scratch[yy*X+x];
  for(int y=0;y<Y;y++){
   if(y){int add=y+9,remove=y-10;if(add<Y)sum+=scratch[add*X+x];if(remove>=0)sum-=scratch[remove*X+x];}
   const int at=y*X+x;
   if(sum)reg[at]=0;else if(dilation[at])reg[at]=255;
  }
 }
}

int zero_fast_forgeries(const int *votes,int *mask,int *reg,meaningful_reg *regions,int X,int Y,int excluded,int grid_max){
 if(X<1||Y<1||(size_t)X*(size_t)Y>INT32_MAX)return -2;
 const int N=X*Y;const size_t words=((size_t)N+31)/32;
 if(words>SIZE_MAX/(64*sizeof(uint32_t))||(size_t)N>SIZE_MAX/sizeof(int))return -2;
 uint32_t *bits=calloc(words*64,sizeof(uint32_t));int *queue=malloc((size_t)N*sizeof(int)),*scratch=malloc((size_t)N*sizeof(int));
 if(!bits||!queue||!scratch){free(bits);free(queue);free(scratch);return -1;}
 for(int i=0;i<N;i++){int v=votes[i];if(v>=0&&v<=grid_max&&v<64&&v!=excluded)bits[(size_t)v*words+(i>>5)]|=1u<<(i&31);}
 double logNT=2.0*log10(64.0)+2.0*log10(X)+2.0*log10(Y);
 const int minimum=(int)ceil(64.0*logNT/log10(64.0));int found=0;
 for(int sx=0;sx<X;sx++)for(int sy=0;sy<Y;sy++){
  const int seed=sx+sy*X,grid=votes[seed];
  if(grid<0||grid>grid_max||grid>=64||grid==excluded)continue;
  uint32_t *set=bits+(size_t)grid*words;uint32_t bit=1u<<(seed&31);
  if(!(set[seed>>5]&bit))continue;
  set[seed>>5]&=~bit;queue[0]=seed;int count=1,x0=sx,x1=sx,y0=sy,y1=sy;
  for(int head=0;head<count;head++){
   int pixel=queue[head],x=pixel%X,y=pixel/X,left=x>9?x-9:0,right=x+9<X?x+9:X-1,top=y>9?y-9:0,bottom=y+9<Y?y+9:Y-1;
   for(int yy=top;yy<=bottom;yy++){
    int first=yy*X+left,last=yy*X+right,wa=first>>5,wb=last>>5;
    for(int w=wa;w<=wb;w++){
     uint32_t pending=set[w];if(w==wa)pending&=UINT32_MAX<<(first&31);if(w==wb)pending&=UINT32_MAX>>(31-(last&31));
     set[w]&=~pending;
     while(pending){int p=w*32+__builtin_ctz(pending),xx=p%X;pending&=pending-1;queue[count++]=p;if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(yy<y0)y0=yy;if(yy>y1)y1=yy;}
    }
   }
  }
  if(count>=minimum){double lnfa=log_nfa((x1-x0+1)*(y1-y0+1)/64,count/64,1.0/64.0,logNT);if(lnfa<0.0){
   regions[found++]=(meaningful_reg){.x0=x0,.y0=y0,.x1=x1,.y1=y1,.grid=grid,.lnfa=lnfa};for(int i=0;i<count;i++)mask[queue[i]]=255;
  }}
 }
 free(bits);
 zero_fast_closing(mask,reg,scratch,queue,X,Y);free(scratch);free(queue);return found;
}

/* Byte-store adapter. All caller planes are admitted before begin. The handle
 * owns its word sets and queue until dispose; outputs are private until done.
 * step() bounds graph scans AND marking work. Closing is split by rows/columns
 * so no component can suppress cooperative cancellation for its full size. */
typedef struct {
 const unsigned char *votes,*excluded;
 unsigned char *mask,*reg;
 meaningful_reg *regions;
 uint32_t *bits;int *queue;
 int X,Y,N,exclude,maximum,excludeSource,minimum,phase,cursor,head,tail,mark;
 int grid,x0,y0,x1,y1,count,visited,components,closing;
 size_t words;
 double logNT;
} zero_byte_regions;

void zero_byte_regions_dispose(zero_byte_regions *s){if(s){free(s->bits);free(s->queue);free(s);}}
zero_byte_regions *zero_byte_regions_begin(const unsigned char *votes,const unsigned char *excluded,unsigned char *mask,unsigned char *reg,meaningful_reg *regions,int X,int Y,int exclude,int maximum,int excludeSource){
 if(!votes||!mask||!reg||!regions||X<16||Y<16||(size_t)X*Y>INT32_MAX||maximum<0||maximum>63||exclude< -1||exclude>63)return NULL;
 zero_byte_regions *s=calloc(1,sizeof(*s));if(!s)return NULL;
 s->X=X;s->Y=Y;s->N=X*Y;s->words=((size_t)s->N+31)/32;
 if(s->words>SIZE_MAX/(64*sizeof(uint32_t))||(size_t)s->N>SIZE_MAX/sizeof(int)){free(s);return NULL;}
 s->bits=calloc(64*s->words,sizeof(uint32_t));s->queue=malloc((size_t)s->N*sizeof(int));if(!s->bits||!s->queue){zero_byte_regions_dispose(s);return NULL;}
 s->votes=votes;s->excluded=excluded;s->mask=mask;s->reg=reg;s->regions=regions;s->exclude=exclude;s->maximum=maximum;s->excludeSource=excludeSource;
 s->logNT=2.0*log10(64.0)+2.0*log10(X)+2.0*log10(Y);s->minimum=(int)ceil(64.0*s->logNT/log10(64.0));
 memset(mask,0,(size_t)s->N);memset(reg,0,(size_t)s->N);
 for(int i=0;i<s->N;i++){int g=votes[i];if(g<=maximum&&g!=exclude&&(!excluded||excluded[i]!=excludeSource))s->bits[(size_t)g*s->words+(i>>5)]|=1u<<(i&31);}
 return s;
}
static void byte_horizontal_row(zero_byte_regions *s,int y,int second){
 unsigned char *scratch=(unsigned char*)s->queue;const unsigned char *input=second?s->reg:s->mask;int X=s->X,sum=0,allowed=y>=9&&y<s->Y-9;
 for(int x=0;x<X;x++){
  if(x==0){for(int xx=0;xx<=9&&xx<X;xx++)if(allowed&&xx>=9&&xx<X-9)sum+=second?input[y*X+xx]==0:input[y*X+xx]!=0;}
  else if(allowed){int add=x+9,remove=x-10;if(add>=9&&add<X-9)sum+=second?input[y*X+add]==0:input[y*X+add]!=0;if(remove>=9&&remove<X-9)sum-=second?input[y*X+remove]==0:input[y*X+remove]!=0;}
  scratch[y*X+x]=sum>0;
 }
}
static void byte_vertical_column(zero_byte_regions *s,int x,int second){
 const unsigned char *scratch=(const unsigned char*)s->queue;int X=s->X,Y=s->Y,sum=0;for(int yy=0;yy<=9&&yy<Y;yy++)sum+=scratch[yy*X+x];
 for(int y=0;y<Y;y++){
  if(y){int add=y+9,remove=y-10;if(add<Y)sum+=scratch[add*X+x];if(remove>=0)sum-=scratch[remove*X+x];}
  int at=y*X+x;s->reg[at]=(second?(s->reg[at]!=0&&sum==0):sum>0)?255:0;
 }
}
int zero_byte_regions_step(zero_byte_regions *s,int limit){
 if(!s||limit<1)return -1;int work=0;
 while(work<limit){
  if(s->phase==0){
   if(s->cursor==s->N){free(s->bits);s->bits=NULL;s->phase=3;s->closing=0;continue;}
   int x=s->cursor/s->Y,y=s->cursor%s->Y,p=x+y*s->X,g=s->votes[p];s->cursor++;work++;
   if(g>s->maximum||g==s->exclude||s->excluded&&s->excluded[p]==s->excludeSource)continue;
   uint32_t *set=s->bits+(size_t)g*s->words,bit=1u<<(p&31);if(!(set[p>>5]&bit))continue;
   set[p>>5]&=~bit;s->queue[0]=p;s->tail=1;s->head=0;s->grid=g;s->x0=s->x1=x;s->y0=s->y1=y;s->phase=1;
  }else if(s->phase==1){
   if(s->head==s->tail){
    s->visited+=s->tail;s->components++;s->phase=0;
    if(s->tail>=s->minimum){double lnfa=log_nfa((s->x1-s->x0+1)*(s->y1-s->y0+1)/64,s->tail/64,1.0/64.0,s->logNT);if(lnfa<0){s->regions[s->count++]=(meaningful_reg){.x0=s->x0,.y0=s->y0,.x1=s->x1,.y1=s->y1,.grid=s->grid,.lnfa=lnfa};s->phase=2;s->mark=0;}}
    continue;
   }
   int p=s->queue[s->head++],x=p%s->X,y=p/s->X,left=x>9?x-9:0,right=x+9<s->X?x+9:s->X-1,top=y>9?y-9:0,bottom=y+9<s->Y?y+9:s->Y-1;uint32_t *set=s->bits+(size_t)s->grid*s->words;
   for(int yy=top;yy<=bottom;yy++){int first=yy*s->X+left,last=yy*s->X+right,wa=first>>5,wb=last>>5;for(int w=wa;w<=wb;w++){
    uint32_t pending=set[w];if(w==wa)pending&=UINT32_MAX<<(first&31);if(w==wb)pending&=UINT32_MAX>>(31-(last&31));set[w]&=~pending;
    while(pending){int at=w*32+__builtin_ctz(pending),xx=at%s->X;pending&=pending-1;s->queue[s->tail++]=at;if(xx<s->x0)s->x0=xx;if(xx>s->x1)s->x1=xx;if(yy<s->y0)s->y0=yy;if(yy>s->y1)s->y1=yy;}
   }}work++;
  }else if(s->phase==2){s->mask[s->queue[s->mark++]]=255;work++;if(s->mark==s->tail)s->phase=0;
  }else if(s->phase==3||s->phase==5){byte_horizontal_row(s,s->closing++,s->phase==5);work+=s->X;if(s->closing==s->Y){s->phase++;s->closing=0;}
  }else if(s->phase==4||s->phase==6){byte_vertical_column(s,s->closing++,s->phase==6);work+=s->Y;if(s->closing==s->X){s->phase++;s->closing=0;}
  }else return 1;
 }
 return s->phase==7;
}
int zero_byte_regions_count(const zero_byte_regions *s){return s?s->count:-1;}
int zero_byte_regions_visited(const zero_byte_regions *s){return s?s->visited:-1;}
int zero_byte_regions_components(const zero_byte_regions *s){return s?s->components:-1;}
int zero_byte_regions_phase(const zero_byte_regions *s){return s?s->phase:-1;}
