/* Optional native-channel reader for local inspection. Reuses the established
 * libjpeg-turbo paged input/backing-store protocol without touching RGB import. */
#define JPEG_INTERNALS
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <setjmp.h>
#include "jpeglib.h"
#include "jerror.h"
#include "jmemsys.h"
#include <emscripten.h>

EM_ASYNC_JS(int, color_encoded_read, (unsigned char* p,unsigned n), {
 try{return await Module.readEncoded(p,n);}catch(error){Module.ioFailure=error;return -1;}
});
EM_ASYNC_JS(int, color_backing_open, (unsigned n), {
 try{return await Module.openBacking(n);}catch(error){Module.ioFailure=error;return 0;}
});
EM_ASYNC_JS(int, color_backing_io, (int id,unsigned char* p,unsigned offset,unsigned n,int writing), {
 try{await Module.backingIO(id,p,offset,n,writing);return 1;}catch(error){Module.ioFailure=error;return 0;}
});
EM_ASYNC_JS(void, color_backing_close, (int id), {
 try{await Module.closeBacking(id);}catch(error){Module.ioFailure??=error;}
});
EM_ASYNC_JS(int, color_decoded_write, (unsigned char* p,double offset,unsigned n), {
 try{await Module.writeDecoded(p,offset,n);return 1;}catch(error){Module.ioFailure=error;return 0;}
});
void* jpeg_get_small(j_common_ptr c,size_t n){return malloc(n);}
void jpeg_free_small(j_common_ptr c,void* p,size_t n){free(p);}
void* jpeg_get_large(j_common_ptr c,size_t n){return malloc(n);}
void jpeg_free_large(j_common_ptr c,void* p,size_t n){free(p);}
size_t jpeg_mem_available(j_common_ptr c,size_t minimum,size_t maximum,size_t allocated){return c->mem->max_memory_to_use>allocated?c->mem->max_memory_to_use-allocated:0;}
static void backing_read(j_common_ptr c,backing_store_ptr s,void* p,long offset,long n){if(offset<0||n<0||!color_backing_io((int)(uintptr_t)s->temp_file,p,offset,n,0))ERREXIT(c,JERR_FILE_READ);}
static void backing_write(j_common_ptr c,backing_store_ptr s,void* p,long offset,long n){if(offset<0||n<0||!color_backing_io((int)(uintptr_t)s->temp_file,p,offset,n,1))ERREXIT(c,JERR_FILE_WRITE);}
static void backing_close(j_common_ptr c,backing_store_ptr s){color_backing_close((int)(uintptr_t)s->temp_file);}
void jpeg_open_backing_store(j_common_ptr c,backing_store_ptr s,long n){int id=n>0?color_backing_open(n):0;if(!id)ERREXIT(c,JERR_TFILE_CREATE);s->temp_file=(FILE*)(uintptr_t)id;s->read_backing_store=backing_read;s->write_backing_store=backing_write;s->close_backing_store=backing_close;}
long jpeg_mem_init(j_common_ptr c){return 8*1024*1024;}
void jpeg_mem_term(j_common_ptr c){}

static struct jpeg_decompress_struct decoder;
static struct{struct jpeg_error_mgr pub;jmp_buf jump;} error;
static struct jpeg_source_mgr input;
static unsigned char encoded[65536];
static unsigned char* output;
static int failure,channels,inverted,progressive;
static void fail(j_common_ptr c){failure=c->err->msg_code==JERR_OUT_OF_MEMORY?2:1;longjmp(error.jump,1);}
static void input_init(j_decompress_ptr c){}
static boolean input_fill(j_decompress_ptr c){int n=color_encoded_read(encoded,sizeof(encoded));if(n<=0||n>sizeof(encoded))ERREXIT(c,JERR_INPUT_EOF);c->src->next_input_byte=encoded;c->src->bytes_in_buffer=n;return TRUE;}
static void input_skip(j_decompress_ptr c,long n){if(n<=0)return;while((size_t)n>c->src->bytes_in_buffer){n-=c->src->bytes_in_buffer;input_fill(c);}c->src->next_input_byte+=n;c->src->bytes_in_buffer-=n;}
static void input_term(j_decompress_ptr c){}
void native_color_close(void){if(decoder.mem)jpeg_destroy_decompress(&decoder);free(output);output=NULL;}
int native_color_error(void){return failure;}
int native_color_channels(void){return channels;}
int native_color_adobe_inverted(void){return inverted;}
int native_color_progressive(void){return progressive;}
int native_color_decode(unsigned width,unsigned height,unsigned cache_bytes){
 failure=channels=inverted=progressive=0;decoder.err=jpeg_std_error(&error.pub);error.pub.error_exit=fail;
 if(setjmp(error.jump)){native_color_close();return 0;}
 jpeg_create_decompress(&decoder);decoder.mem->max_memory_to_use=cache_bytes;
 input.init_source=input_init;input.fill_input_buffer=input_fill;input.skip_input_data=input_skip;input.resync_to_restart=jpeg_resync_to_restart;input.term_source=input_term;input.bytes_in_buffer=0;input.next_input_byte=NULL;decoder.src=&input;
 jpeg_read_header(&decoder,TRUE);
 if(!width||!height||decoder.image_width!=width||decoder.image_height!=height||decoder.data_precision!=8||(decoder.num_components!=1&&decoder.num_components!=3&&decoder.num_components!=4)){native_color_close();return 0;}
 channels=decoder.num_components;progressive=decoder.progressive_mode;
 if(channels==4){if(decoder.jpeg_color_space!=JCS_CMYK&&decoder.jpeg_color_space!=JCS_YCCK){native_color_close();return 0;}decoder.out_color_space=JCS_CMYK;inverted=decoder.saw_Adobe_marker;}
 else decoder.out_color_space=channels==1?JCS_GRAYSCALE:JCS_RGB;
 decoder.dct_method=JDCT_ISLOW;jpeg_start_decompress(&decoder);
 if(decoder.output_components!=channels){native_color_close();return 0;}
 const unsigned row_bytes=width*channels;unsigned rows=(1024*1024)/row_bytes;if(rows>32)rows=32;if(!rows){native_color_close();return 0;}
 output=malloc((size_t)row_bytes*rows);if(!output)ERREXIT1(&decoder,JERR_OUT_OF_MEMORY,0);
 while(decoder.output_scanline<decoder.output_height){
  const unsigned first=decoder.output_scanline;unsigned count=0;
  while(count<rows&&decoder.output_scanline<decoder.output_height){JSAMPROW row=output+(size_t)count*row_bytes;if(jpeg_read_scanlines(&decoder,&row,1)!=1)ERREXIT(&decoder,JERR_INPUT_EOF);count++;}
  if(inverted)for(unsigned i=0;i<count*row_bytes;i++)output[i]=255-output[i];
  if(!color_decoded_write(output,(double)((uint64_t)first*row_bytes),count*row_bytes))ERREXIT(&decoder,JERR_FILE_WRITE);
 }
 jpeg_finish_decompress(&decoder);const int ok=error.pub.num_warnings==0;native_color_close();return ok;
}
