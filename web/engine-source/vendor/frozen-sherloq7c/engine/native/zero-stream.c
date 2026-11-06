/* Bounded adapters around the original ZERO significance and vote arithmetic.
 * Derived work: AGPL-3.0-or-later, see vendor/zero/LICENSE. */
#include <stdlib.h>
#include <math.h>
#include "zero.h"
void zero_rgb_luminance(const unsigned char*,double*,int);
void zero_set_reference(int);
void zero_luminance_bytes(const unsigned char* rgb,unsigned char* output,int n){
 double values[1024];for(int at=0;at<n;at+=1024){int count=n-at<1024?n-at:1024;zero_rgb_luminance(rgb+at*3,values,count);for(int i=0;i<count;i++)output[at+i]=(unsigned char)values[i];}
}
static int vote_bytes(const unsigned char* input,signed char* output,int width,int height,int reference){
 int n=width*height;double* luminance=malloc((size_t)n*sizeof(double));int* votes=malloc((size_t)n*sizeof(int));
 if(!luminance||!votes){free(luminance);free(votes);return 0;}
 for(int i=0;i<n;i++)luminance[i]=input[i];zero_set_reference(reference);compute_grid_votes_per_pixel(luminance,votes,width,height);
 for(int i=0;i<n;i++)output[i]=(signed char)votes[i];free(luminance);free(votes);return 1;
}
int zero_votes_bytes(const unsigned char* input,signed char* output,int width,int height){return vote_bytes(input,output,width,height,0);}
int zero_reference_votes_bytes(const unsigned char* input,signed char* output,int width,int height){return vote_bytes(input,output,width,height,1);}
int zero_scores_from_counts(const int* counts,int width,int height,int winner,double* scores){
 double logNT=2.0*log10(64.0)+2.0*log10(width)+2.0*log10(height);
 for(int i=0;i<64;i++)scores[i]=log_nfa(width*height/64,counts[i]/64,1.0/64.0,logNT);
 return winner>=0&&winner<64&&scores[winner]<0.0?winner:-1;
}
static double region_lognt(int width,int height){return 2.0*log10(64.0)+2.0*log10(width)+2.0*log10(height);}
int zero_region_minimum(int width,int height){return (int)ceil(64.0*region_lognt(width,height)/log10(64.0));}
double zero_region_nfa(int width,int height,int area,int count){return log_nfa(area/64,count/64,1.0/64.0,region_lognt(width,height));}
/* Native closing: only interior centers dilate; only interior zero centers of
 * that dilation remove pixels. Border behavior deliberately remains unusual. */
int zero_close_band(const unsigned char* input,unsigned char* output,int width,int bandHeight,int sourceY,int imageHeight,int rowOffset,int outputRows,int second){
 unsigned char* horizontal=malloc((size_t)width*bandHeight);if(!horizontal)return 0;
 for(int y=0;y<bandHeight;y++){
  int sum=0,globalY=sourceY+y;
  for(int x=0;x<width;x++){
   if(x==0){for(int xx=0;xx<=9&&xx<width;xx++)if(xx>=9&&xx<width-9&&globalY>=9&&globalY<imageHeight-9)sum+=second?input[y*width+xx]==0:input[y*width+xx]!=0;}
   else{int add=x+9,remove=x-10;if(globalY>=9&&globalY<imageHeight-9){if(add>=9&&add<width-9)sum+=second?input[y*width+add]==0:input[y*width+add]!=0;if(remove>=9&&remove<width-9)sum-=second?input[y*width+remove]==0:input[y*width+remove]!=0;}}
   horizontal[y*width+x]=sum>0;
  }
 }
 for(int x=0;x<width;x++){
  int sum=0;for(int y=rowOffset-9;y<=rowOffset+9;y++)if(y>=0&&y<bandHeight)sum+=horizontal[y*width+x];
  for(int row=0;row<outputRows;row++){
   int y=rowOffset+row;if(row){int add=y+9,remove=y-10;if(add<bandHeight)sum+=horizontal[add*width+x];if(remove>=0)sum-=horizontal[remove*width+x];}
   output[row*width+x]=(second?(input[y*width+x]!=0&&sum==0):sum>0)?255:0;
  }
 }
 free(horizontal);return 1;
}
