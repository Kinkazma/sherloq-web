// libpng pull reader; async input suspension does not change row arithmetic.
#include <png.h>
#include <emscripten.h>
#include <stdlib.h>
#include <setjmp.h>
#include <string.h>
static png_structp reader;static png_infop info;static unsigned width,height,passes,rows_read;static int failure;
EM_ASYNC_JS(int, encoded_read, (unsigned char* target,unsigned length), {
 try {await Module['readEncoded'](target,length);return 1;}
 catch(error){Module['readFailure']=error;return 0;}
});
static void input(png_structp p,png_bytep output,png_size_t length){if(!encoded_read(output,length))png_error(p,"Encoded source read failed");}
static void error_handler(png_structp p,png_const_charp message){failure=(strstr(message,"memory")||strstr(message,"Memory"))?2:1;png_longjmp(p,1);}
static void warning_handler(png_structp p,png_const_charp message){(void)p;(void)message;}
void png_stream_close(void){if(reader)png_destroy_read_struct(&reader,&info,NULL);reader=NULL;info=NULL;}
int png_stream_open(void){
 png_stream_close();failure=0;rows_read=0;reader=png_create_read_struct(PNG_LIBPNG_VER_STRING,NULL,error_handler,warning_handler);if(!reader){failure=2;return 0;}
 info=png_create_info_struct(reader);if(!info){failure=2;return 0;}if(setjmp(png_jmpbuf(reader)))return 0;
 png_set_read_fn(reader,NULL,input);png_set_user_limits(reader,65500,65500);
 // Structural metadata and orientation are read separately from unchanged bytes.
 // Ignore ancillary transformations/profiles, matching the native RGB policy.
 png_set_keep_unknown_chunks(reader,PNG_HANDLE_CHUNK_NEVER,NULL,-1);
 png_read_info(reader,info);width=png_get_image_width(reader,info);height=png_get_image_height(reader,info);const int depth=png_get_bit_depth(reader,info),type=png_get_color_type(reader,info);
 if(depth==16)png_set_strip_16(reader);png_set_strip_alpha(reader);
 if(type==PNG_COLOR_TYPE_PALETTE)png_set_palette_to_rgb(reader);
 if(!(type&PNG_COLOR_MASK_COLOR)&&depth<8)png_set_expand_gray_1_2_4_to_8(reader);
 if(!(type&PNG_COLOR_MASK_COLOR))png_set_gray_to_rgb(reader);
 passes=png_set_interlace_handling(reader);png_read_update_info(reader,info);
 if(png_get_rowbytes(reader,info)!=width*3||png_get_channels(reader,info)!=3)png_error(reader,"Unexpected RGB row layout");return 1;
}
int png_stream_rows(unsigned char* rgb,unsigned count){
 if(!reader||!count||count>256||rows_read+count>height*passes)return 0;if(setjmp(png_jmpbuf(reader)))return 0;
 for(unsigned y=0;y<count;y++){png_read_row(reader,rgb+y*width*3,NULL);rows_read++;}return 1;
}
int png_stream_end(void){if(!reader||rows_read!=height*passes)return 0;if(setjmp(png_jmpbuf(reader)))return 0;png_read_end(reader,NULL);return 1;}
unsigned png_stream_width(void){return width;}unsigned png_stream_height(void){return height;}unsigned png_stream_passes(void){return passes;}int png_stream_error(void){return failure;}
