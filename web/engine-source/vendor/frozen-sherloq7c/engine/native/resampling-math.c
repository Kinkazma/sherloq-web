// Native NumPy1.26.4 complex FFT ordering and OpenCV4.11.0 float64 pyrUp.
// The generated pocketfft file removes only Python glue; upstream remains intact.
#include "../.build/resampling-pocketfft.c"
int resampling_fft2(const double* input,double* output,int width,int height){
 if(width<1||height<1||width>16384||height>16384)return 0;
 cfft_plan row=make_cfft_plan(width),col=make_cfft_plan(height);double* column=(double*)malloc(2*height*sizeof(double));int ok=0;
 if(!row||!col||!column)goto cleanup;
 for(int i=0;i<width*height;i++){output[2*i]=input[i];output[2*i+1]=0;}
 for(int y=0;y<height;y++)if(cfft_forward(row,output+2*y*width,1))goto cleanup;
 for(int x=0;x<width;x++){for(int y=0;y<height;y++){column[2*y]=output[2*(y*width+x)];column[2*y+1]=output[2*(y*width+x)+1];}if(cfft_forward(col,column,1))goto cleanup;for(int y=0;y<height;y++){output[2*(y*width+x)]=column[2*y];output[2*(y*width+x)+1]=column[2*y+1];}}
 ok=1;
 cleanup:if(row)destroy_cfft_plan(row);if(col)destroy_cfft_plan(col);free(column);return ok;
}

int resampling_pyrup(const double* input,double* output,int w,int h){
 if(w<1||h<1||w>16384||h>16384)return 0;
 double* horizontal=malloc(w*2*h*sizeof(double));if(!horizontal)return 0;
 for(int y=0;y<h;y++){const double* in=input+y*w;double* row=horizontal+y*w*2;if(w==1){row[0]=row[1]=in[0]*8;continue;}
 row[0]=fma(in[0],6,in[1]*2);row[1]=(in[0]+in[1])*4;row[2*w-2]=fma(in[w-1],7,in[w-2]);row[2*w-1]=in[w-1]*8;
 for(int x=1;x<w-1;x++){row[2*x]=fma(in[x],6,in[x-1])+in[x+1];row[2*x+1]=(in[x]+in[x+1])*4;}}
 for(int y=0;y<h;y++){const double* a=horizontal+(y==0?(h>1?1:0):y-1)*w*2;const double* b=horizontal+y*w*2;const double* c=horizontal+(y+1<h?y+1:y)*w*2;
 for(int x=0;x<2*w;x++){output[(2*y)*w*2+x]=(fma(b[x],6,a[x])+c[x])*(1./64);output[(2*y+1)*w*2+x]=(b[x]+c[x])*4*(1./64);}}
 free(horizontal);return 1;
}
