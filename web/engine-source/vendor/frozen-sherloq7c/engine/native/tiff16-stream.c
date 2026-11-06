// Native unsigned RGB16 decoding. No TIFF RGBA8 conversion is used.
#include <tiffio.h>
#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <stdarg.h>
static TIFF *tif;static uint64_t source_size,position;static uint32_t width,height,bw,bh,ow,oh;
static uint16_t samples,planar,orientation,photometric;static unsigned char *raw;static uint16_t *rgb;static int tiled,failure;
EM_ASYNC_JS(int,encoded_tiff16_read,(unsigned char* target,unsigned length,unsigned low,unsigned high),{
 try{await Module['readEncoded'](target,length,high*4294967296+low);return 1;}catch(error){Module['readFailure']=error;return 0;}
});
static tmsize_t read_input(thandle_t h,void* target,tmsize_t n){(void)h;if(n<0||position>source_size||(uint64_t)n>source_size-position)return 0;if(!encoded_tiff16_read(target,(unsigned)n,(unsigned)position,(unsigned)(position>>32)))return 0;position+=n;return n;}
static tmsize_t write_input(thandle_t h,void*p,tmsize_t n){(void)h;(void)p;(void)n;return 0;}
static toff_t seek_input(thandle_t h,toff_t n,int w){(void)h;if(w==SEEK_SET)position=n;else if(w==SEEK_CUR)position+=n;else if(w==SEEK_END)position=source_size+n;else return(toff_t)-1;return position;}
static int close_input(thandle_t h){(void)h;return 0;}static toff_t size_input(thandle_t h){(void)h;return source_size;}
static int error_handler(TIFF*t,void*u,const char*m,const char*f,va_list ap){(void)t;(void)u;(void)m;char msg[512];vsnprintf(msg,sizeof(msg),f,ap);failure=(strstr(msg,"alloc")||strstr(msg,"memory")||strstr(msg,"Memory"))?2:1;return 1;}
static int warning_handler(TIFF*t,void*u,const char*m,const char*f,va_list ap){(void)t;(void)u;(void)m;(void)f;(void)ap;return 1;}
void tiff16_close(void){if(tif)TIFFClose(tif);tif=NULL;free(raw);raw=NULL;free(rgb);rgb=NULL;}
int tiff16_open(double length,unsigned limit){
 tiff16_close();failure=0;source_size=(uint64_t)length;position=0;TIFFOpenOptions* o=TIFFOpenOptionsAlloc();if(!o){failure=2;return 0;}
 TIFFOpenOptionsSetMaxSingleMemAlloc(o,limit);TIFFOpenOptionsSetErrorHandlerExtR(o,error_handler,NULL);TIFFOpenOptionsSetWarningHandlerExtR(o,warning_handler,NULL);
 tif=TIFFClientOpenExt("original-rgb16","r",NULL,read_input,write_input,seek_input,close_input,size_input,NULL,NULL,o);TIFFOpenOptionsFree(o);if(!tif)return 0;
 uint16_t bits,kind;TIFFGetFieldDefaulted(tif,TIFFTAG_BITSPERSAMPLE,&bits);TIFFGetFieldDefaulted(tif,TIFFTAG_SAMPLESPERPIXEL,&samples);TIFFGetFieldDefaulted(tif,TIFFTAG_PHOTOMETRIC,&photometric);TIFFGetFieldDefaulted(tif,TIFFTAG_SAMPLEFORMAT,&kind);TIFFGetFieldDefaulted(tif,TIFFTAG_PLANARCONFIG,&planar);TIFFGetFieldDefaulted(tif,TIFFTAG_ORIENTATION,&orientation);
 if(bits!=16||!((photometric==PHOTOMETRIC_RGB&&samples==3)||((photometric==PHOTOMETRIC_MINISBLACK||photometric==PHOTOMETRIC_MINISWHITE)&&samples==1))||kind!=SAMPLEFORMAT_UINT||(planar!=PLANARCONFIG_CONTIG&&planar!=PLANARCONFIG_SEPARATE)||orientation<1||orientation>8)return 0;
 if(!TIFFGetField(tif,TIFFTAG_IMAGEWIDTH,&width)||!TIFFGetField(tif,TIFFTAG_IMAGELENGTH,&height)||!width||!height||width>65500||height>65500)return 0;
 tiled=TIFFIsTiled(tif);if(tiled){if(!TIFFGetField(tif,TIFFTAG_TILEWIDTH,&bw)||!TIFFGetField(tif,TIFFTAG_TILELENGTH,&bh))return 0;}else{bw=width;TIFFGetFieldDefaulted(tif,TIFFTAG_ROWSPERSTRIP,&bh);if(bh>height)bh=height;}
 uint64_t pixels=(uint64_t)bw*bh,raw_size=tiled?TIFFTileSize64(tif):TIFFStripSize64(tif);
 if(!bw||!bh||pixels>limit/6||raw_size>limit)return 0;
 raw=malloc((size_t)raw_size);rgb=malloc((size_t)pixels*6);if(!raw||!rgb){failure=2;return 0;}return 1;
}
int tiff16_block(unsigned x,unsigned y){
 if(!tif||x>=width||y>=height||x%bw||y%bh)return 0;ow=width-x<bw?width-x:bw;oh=height-y<bh?height-y:bh;
 for(unsigned c=0;c<(planar==PLANARCONFIG_SEPARATE?samples:1);c++){
  tmsize_t n=tiled?TIFFReadEncodedTile(tif,TIFFComputeTile(tif,x,y,0,c),raw,(tmsize_t)-1):TIFFReadEncodedStrip(tif,TIFFComputeStrip(tif,y,c),raw,(tmsize_t)-1);
  if(n<0)return 0;const unsigned stride=planar==PLANARCONFIG_SEPARATE?bw:bw*samples;
  if((uint64_t)n<(uint64_t)stride*oh*2)return 0;
  const uint16_t* in=(const uint16_t*)raw;
  for(unsigned row=0;row<oh;row++)for(unsigned col=0;col<ow;col++){
   if(samples==1){const uint16_t v=photometric==PHOTOMETRIC_MINISWHITE?65535-in[row*stride+col]:in[row*stride+col];for(unsigned k=0;k<3;k++)rgb[(row*ow+col)*3+k]=v;}
   else if(planar==PLANARCONFIG_SEPARATE)rgb[(row*ow+col)*3+c]=in[row*stride+col];
   else for(unsigned k=0;k<3;k++)rgb[(row*ow+col)*3+k]=in[row*stride+col*3+k];
  }
 }return 1;
}
unsigned tiff16_width(void){return width;}unsigned tiff16_height(void){return height;}unsigned tiff16_block_width(void){return bw;}unsigned tiff16_block_height(void){return bh;}unsigned tiff16_out_width(void){return ow;}unsigned tiff16_out_height(void){return oh;}unsigned tiff16_orientation(void){return orientation;}uint16_t* tiff16_data(void){return rgb;}int tiff16_error(void){return failure;}
