// Lossless row writer with backpressured encoded output; no full raster staging.
#include <png.h>
#include <emscripten.h>
#include <stdlib.h>
#include <setjmp.h>
#include <string.h>
static png_structp writer;static png_infop info;static unsigned width,height,channels,rows_written;static int failure;
EM_ASYNC_JS(int, encoded_write, (const unsigned char* data,unsigned length), {
 try{await Module['writeEncoded'](data,length);return 1;}
 catch(error){Module['writeFailure']=error;return 0;}
});
static void output(png_structp p,png_bytep data,png_size_t length){if(!encoded_write(data,length))png_error(p,"Encoded output write failed");}
static void flush(png_structp p){(void)p;}
static void error_handler(png_structp p,png_const_charp message){failure=(strstr(message,"memory")||strstr(message,"Memory"))?2:1;png_longjmp(p,1);}
static void warning_handler(png_structp p,png_const_charp message){(void)p;(void)message;}
void png_export_close(void){if(writer)png_destroy_write_struct(&writer,&info);writer=NULL;info=NULL;}
int png_export_open(unsigned w,unsigned h,unsigned c,int compression){
 png_export_close();failure=0;rows_written=0;if(!w||!h||w>65500||h>65500||(c!=1&&c!=3)||compression<0||compression>9)return 0;width=w;height=h;channels=c;
 writer=png_create_write_struct(PNG_LIBPNG_VER_STRING,NULL,error_handler,warning_handler);if(!writer){failure=2;return 0;}info=png_create_info_struct(writer);if(!info){failure=2;return 0;}if(setjmp(png_jmpbuf(writer)))return 0;
 png_set_write_fn(writer,NULL,output,flush);png_set_compression_level(writer,compression);png_set_compression_buffer_size(writer,65536);
 png_set_IHDR(writer,info,width,height,8,c==3?PNG_COLOR_TYPE_RGB:PNG_COLOR_TYPE_GRAY,PNG_INTERLACE_NONE,PNG_COMPRESSION_TYPE_DEFAULT,PNG_FILTER_TYPE_DEFAULT);png_write_info(writer,info);return 1;
}
int png_export_rows(unsigned char* data,unsigned count){if(!writer||!count||count>32||rows_written+count>height)return 0;if(setjmp(png_jmpbuf(writer)))return 0;for(unsigned y=0;y<count;y++){png_write_row(writer,data+y*width*channels);rows_written++;}return 1;}
int png_export_end(void){if(!writer||rows_written!=height)return 0;if(setjmp(png_jmpbuf(writer)))return 0;png_write_end(writer,NULL);return 1;}
int png_export_error(void){return failure;}
