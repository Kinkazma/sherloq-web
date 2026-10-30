/* Private ZERO GPU threshold-filter refinement, AGPL-3.0-or-later.
 * GPU never decides an ambiguous coefficient. The original frozen-cosine
 * double multiplication/FMA64 order below supplies its strict |DCT|<0.5 test.
 */
#include <stdint.h>
#include <math.h>
#include "zero-cosines.h"
static unsigned int gpu_exact_refinements;
unsigned int zero_gpu_exact_refinement_count(void){return gpu_exact_refinements;}
int zero_refine_byte_codes_range(const unsigned char *luma,uint32_t *codes,const uint32_t *low,const uint32_t *high,int X,int Y,int start,int size){
 if(!luma||!codes||!low||!high||X<16||Y<16||(uint64_t)X*Y>INT32_MAX)return -1;
 const int N=X*Y;if(start<0||size<0||start>N||size>N-start)return -1;int count=0;if(start==0)gpu_exact_refinements=0;const int end=start+size;
 for(int at=start;at<end;at++){const int x=at%X,y=at/X;if(x>=X-7||y>=Y-7)continue;if((codes[at]&~191u)||(codes[at]&127u)>63u||(low[at]&1u)||(codes[at]&127u)+__builtin_popcount(low[at])+__builtin_popcount(high[at])>63u)return -2;}
 for(int at=start;at<end;at++){const int x=at%X,y=at/X;if(x>=X-7||y>=Y-7)continue;
  uint64_t pending=((uint64_t)high[at]<<32)|low[at];uint32_t z=codes[at]&127u;unsigned int have=0;double partial[8][8];
  while(pending){int coefficient=__builtin_ctzll(pending),i=coefficient/8,j=coefficient%8;pending&=pending-1;double d=0;
   if(!(have&(1u<<i))){for(int yy=0;yy<8;yy++){double v=0;for(int xx=0;xx<8;xx++)v+=(double)luma[x+xx+(y+yy)*X]*zero_cosines[xx][i];partial[i][yy]=v;}have|=1u<<i;}
   for(int yy=0;yy<8;yy++)d+=partial[i][yy]*zero_cosines[yy][j];
   const double scale=0.25*(i==0?1.0/sqrt(2.0):1.0)*(j==0?1.0/sqrt(2.0):1.0);d*=scale;
   // The same pre-existing native threshold filter and conservative bound.
   // Only actual near-midpoint coefficients enter the original FMA64 order.
   if(fabs(fabs(d)-0.5)<=1e-8){gpu_exact_refinements++;d=0;for(int xx=0;xx<8;xx++)for(int yy=0;yy<8;yy++)d=fma((double)luma[x+xx+(y+yy)*X]*zero_cosines[xx][i],zero_cosines[yy][j],d);d*=scale;}
   if(fabs(d)<0.5)z++;count++;
  }
  codes[at]=(codes[at]&128u)|z;
 }
 return count;
}

int zero_refine_byte_codes(const unsigned char *luma,uint32_t *codes,const uint32_t *low,const uint32_t *high,int X,int Y){if(X<16||Y<16||(uint64_t)X*Y>INT32_MAX)return -1;return zero_refine_byte_codes_range(luma,codes,low,high,X,Y,0,X*Y);}
