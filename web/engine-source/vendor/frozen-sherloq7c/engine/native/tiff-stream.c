// Bounded native RGBA strip/tile decoding with async encoded source reads.
#include <tiffio.h>
#include <emscripten.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <stdarg.h>
#include <stdint.h>
static TIFF* tif;static uint64_t source_size,position;static uint32_t width,height,block_width,block_height,out_width,out_height;static uint32_t* raster;static unsigned char* rgb;static int tiled,failure;
EM_ASYNC_JS(int, encoded_tiff_read, (unsigned char* target,unsigned length,unsigned low,unsigned high), {
 try{await Module['readEncoded'](target,length,high*4294967296+low);return 1;}
 catch(error){Module['readFailure']=error;return 0;}
});
static tmsize_t read_input(thandle_t handle,void* target,tmsize_t count){(void)handle;if(count<0||position>source_size||(uint64_t)count>source_size-position)return 0;if(!encoded_tiff_read(target,(unsigned)count,(unsigned)position,(unsigned)(position>>32)))return 0;position+=count;return count;}
static tmsize_t write_input(thandle_t h,void* p,tmsize_t n){(void)h;(void)p;(void)n;return 0;}
static toff_t seek_input(thandle_t h,toff_t offset,int whence){(void)h;if(whence==SEEK_SET)position=offset;else if(whence==SEEK_CUR)position+=offset;else if(whence==SEEK_END)position=source_size+offset;else return (toff_t)-1;return position;}
static int close_input(thandle_t h){(void)h;return 0;}static toff_t size_input(thandle_t h){(void)h;return source_size;}
static int error_handler(TIFF* t,void* user,const char* module,const char* format,va_list ap){(void)t;(void)user;(void)module;char message[512];vsnprintf(message,sizeof(message),format,ap);failure=(strstr(message,"alloc")||strstr(message,"memory")||strstr(message,"Memory"))?2:1;return 1;}
static int warning_handler(TIFF* t,void* user,const char* module,const char* format,va_list ap){(void)t;(void)user;(void)module;(void)format;(void)ap;return 1;}
void tiff_stream_close(void){if(tif)TIFFClose(tif);tif=NULL;free(raster);raster=NULL;free(rgb);rgb=NULL;}
int tiff_stream_open(double length,unsigned maximum_allocation){
 tiff_stream_close();failure=0;source_size=(uint64_t)length;position=0;
 TIFFOpenOptions* options=TIFFOpenOptionsAlloc();if(!options){failure=2;return 0;}TIFFOpenOptionsSetMaxSingleMemAlloc(options,maximum_allocation);TIFFOpenOptionsSetErrorHandlerExtR(options,error_handler,NULL);TIFFOpenOptionsSetWarningHandlerExtR(options,warning_handler,NULL);
 tif=TIFFClientOpenExt("original-source","r",NULL,read_input,write_input,seek_input,close_input,size_input,NULL,NULL,options);TIFFOpenOptionsFree(options);if(!tif)return 0;
 if(!TIFFGetField(tif,TIFFTAG_IMAGEWIDTH,&width)||!TIFFGetField(tif,TIFFTAG_IMAGELENGTH,&height)||!width||!height||width>65500||height>65500)return 0;
 tiled=TIFFIsTiled(tif);if(tiled){if(!TIFFGetField(tif,TIFFTAG_TILEWIDTH,&block_width)||!TIFFGetField(tif,TIFFTAG_TILELENGTH,&block_height))return 0;}else{block_width=width;TIFFGetFieldDefaulted(tif,TIFFTAG_ROWSPERSTRIP,&block_height);if(block_height>height)block_height=height;}
 if(!block_width||!block_height||(uint64_t)block_width*block_height>maximum_allocation/4)return 0;
 // Preserve libtiff orientation within each native strip/tile. The caller
 // reproduces OpenCV vertical block placement, without a second pixel flip.
 raster=malloc((size_t)block_width*block_height*4);rgb=malloc((size_t)block_width*block_height*3);if(!raster||!rgb){failure=2;return 0;}return 1;
}
int tiff_stream_block(unsigned x,unsigned y){
 if(!tif||x>=width||y>=height||x%block_width||y%block_height)return 0;
 if(!(tiled?TIFFReadRGBATile(tif,x,y,raster):TIFFReadRGBAStrip(tif,y,raster)))return 0;
 out_width=width-x<block_width?width-x:block_width;out_height=height-y<block_height?height-y:block_height;const unsigned raster_height=tiled?block_height:out_height;
 for(unsigned row=0;row<out_height;row++)for(unsigned col=0;col<out_width;col++){const uint32_t pixel=raster[(raster_height-1-row)*block_width+col];unsigned char* out=rgb+(row*out_width+col)*3;out[0]=TIFFGetR(pixel);out[1]=TIFFGetG(pixel);out[2]=TIFFGetB(pixel);}return 1;
}
unsigned tiff_stream_width(void){return width;}unsigned tiff_stream_height(void){return height;}unsigned tiff_stream_block_width(void){return block_width;}unsigned tiff_stream_block_height(void){return block_height;}unsigned tiff_stream_out_width(void){return out_width;}unsigned tiff_stream_out_height(void){return out_height;}unsigned char* tiff_stream_data(void){return rgb;}int tiff_stream_error(void){return failure;}
