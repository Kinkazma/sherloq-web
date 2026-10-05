/* Portable deterministic ZERO vote kernel, AGPL-3.0-or-later.
 * Based on ZERO 2021 (authors/license in vendor/zero) and SHERLOQ parallel.c.
 * The separated float64 transform is only a threshold filter. Values within
 * 1e-8 of |DCT|=0.5 use the original multiplication/FMA order, so no decision
 * is made from a numerically ambiguous shortcut. RGB8 luminance is in [0,255]:
 * sums contain at most 64 terms of magnitude <=255, giving <1e-9 difference
 * under IEEE754 round-to-nearest, including both transform orders/scaling.
 */
#include <stdlib.h>
#include <math.h>
#include "zero.h"
#include "zero-cosines.h"
static int reference=0;
static unsigned int fallbacks=0;
unsigned int zero_fallback_count(void){return fallbacks;}
void zero_reference_votes(double*,int*,int,int);
void zero_set_reference(int value){reference=value;fallbacks=0;}
static int zeros_in_block(double *image,int X,int x,int y,int *constant){
 int cx=1,cy=1;
 for(int xx=0;xx<8&&(cx||cy);xx++)for(int yy=0;yy<8&&(cx||cy);yy++){
  if(image[x+xx+(y+yy)*X]!=image[x+(y+yy)*X])cx=0;
  if(image[x+xx+(y+yy)*X]!=image[x+xx+y*X])cy=0;
 }
 *constant=cx||cy;if(cx&&cy)return 63;
 double partial[8][8];
 for(int i=0;i<8;i++)for(int yy=0;yy<8;yy++){
  double v=0;for(int xx=0;xx<8;xx++)v+=image[x+xx+(y+yy)*X]*zero_cosines[xx][i];partial[i][yy]=v;
 }
 int z=0;
 for(int i=0;i<8;i++)for(int j=0;j<8;j++)if(i||j){
  const double scale=0.25*(i==0?1.0/sqrt(2.0):1.0)*(j==0?1.0/sqrt(2.0):1.0);
  double d=0;for(int yy=0;yy<8;yy++)d+=partial[i][yy]*zero_cosines[yy][j];d*=scale;
  if(fabs(fabs(d)-0.5)<=1e-8){
   fallbacks++;d=0;for(int xx=0;xx<8;xx++)for(int yy=0;yy<8;yy++)d=fma(image[x+xx+(y+yy)*X]*zero_cosines[xx][i],zero_cosines[yy][j],d);d*=scale;
  }
  if(fabs(d)<0.5)z++;
 }
 return z;
}
void compute_grid_votes_per_pixel(double *image,int *votes,int X,int Y){
 if(reference){zero_reference_votes(image,votes,X,Y);return;}
 unsigned char *zeros=xcalloc(X*Y,1),*constant=xcalloc(X*Y,1);
 for(int x=0;x<X-7;x++)for(int y=0;y<Y-7;y++){int c=0;zeros[x+y*X]=zeros_in_block(image,X,x,y,&c);constant[x+y*X]=c;}
 for(int y=0;y<Y;y++)for(int x=0;x<X;x++){
  int winner=-1,maximum=0,ties=0;
  if(x>=7&&y>=7&&x<X-7&&y<Y-7)for(int xx=x-7;xx<=x;xx++)for(int yy=y-7;yy<=y;yy++){
   int at=xx+yy*X,z=zeros[at];if(z==maximum)ties++;if(z>maximum){maximum=z;ties=1;winner=constant[at]?-1:(xx%8)+(yy%8)*8;}
  }
  votes[x+y*X]=ties==1?winner:-1;
 }
 free(zeros);free(constant);
}
/* Same scalar contractions as native rgb2luminance, without retaining three
 * float64 RGB planes. All input channels are uint8, output remains float64. */
void zero_rgb_luminance(const unsigned char *input,double *output,int n){
 for(int i=0;i<n;i++)output[i]=round(fma((double)input[3*i+2],0.114,fma((double)input[3*i],0.299,(double)input[3*i+1]*0.587)));
}
