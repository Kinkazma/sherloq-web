/* One global grayscale JPEG per quality, external bounded encoded storage. */
#include <stdio.h>
#include <stdlib.h>
#include <setjmp.h>
#include <jpeglib.h>
#include <jerror.h>
#include <emscripten.h>
#define IO_SIZE 65536
static struct jpeg_compress_struct encoder;static struct jpeg_decompress_struct decoder;
static struct {struct jpeg_error_mgr pub;jmp_buf jump;} error;
static struct jpeg_destination_mgr destination;static struct jpeg_source_mgr source;
static JOCTET output[IO_SIZE],input[IO_SIZE];static int failed;static unsigned width,height;static unsigned char gray_row[65500];
static unsigned char to_gray(const unsigned char*p){return (p[0]*9798+p[1]*19235+p[2]*3735+16384)>>15;}
EM_ASYNC_JS(int, write_encoded, (const unsigned char* bytes,unsigned length), {
 try{await Module['writeEncoded'](bytes,length);return 1;}catch(error){Module['ioFailure']=error;return 0;}
});
EM_ASYNC_JS(int, read_encoded, (unsigned char* bytes,unsigned length), {
 try{return await Module['readEncoded'](bytes,length);}catch(error){Module['ioFailure']=error;return 0;}
});
static void fail(j_common_ptr c){failed=c->err->msg_code==JERR_OUT_OF_MEMORY?2:1;longjmp(error.jump,1);}
static void init_output(j_compress_ptr c){c->dest->next_output_byte=output;c->dest->free_in_buffer=IO_SIZE;}
static boolean empty_output(j_compress_ptr c){if(!write_encoded(output,IO_SIZE))ERREXIT(c,JERR_FILE_WRITE);init_output(c);return TRUE;}
static void term_output(j_compress_ptr c){size_t length=IO_SIZE-c->dest->free_in_buffer;if(length&&!write_encoded(output,length))ERREXIT(c,JERR_FILE_WRITE);}
static void init_input(j_decompress_ptr c){(void)c;}
static boolean fill_input(j_decompress_ptr c){int n=read_encoded(input,IO_SIZE);if(n<=0)ERREXIT(c,JERR_INPUT_EOF);c->src->next_input_byte=input;c->src->bytes_in_buffer=n;return TRUE;}
static void skip_input(j_decompress_ptr c,long n){if(n>0){while((size_t)n>c->src->bytes_in_buffer){n-=c->src->bytes_in_buffer;fill_input(c);}c->src->next_input_byte+=n;c->src->bytes_in_buffer-=n;}}
static void term_input(j_decompress_ptr c){(void)c;}
void gray_stream_close(void){if(encoder.mem)jpeg_destroy_compress(&encoder);if(decoder.mem)jpeg_destroy_decompress(&decoder);}
static int open_stream(unsigned w,unsigned h,int quality){
 gray_stream_close();failed=0;if(!w||!h||w>JPEG_MAX_DIMENSION||h>JPEG_MAX_DIMENSION||quality<0||quality>100)return 0;width=w;height=h;encoder.err=jpeg_std_error(&error.pub);error.pub.error_exit=fail;if(setjmp(error.jump))return 0;
 jpeg_create_compress(&encoder);destination.init_destination=init_output;destination.empty_output_buffer=empty_output;destination.term_destination=term_output;encoder.dest=&destination;
 encoder.image_width=w;encoder.image_height=h;encoder.input_components=1;encoder.in_color_space=JCS_GRAYSCALE;jpeg_set_defaults(&encoder);encoder.dct_method=JDCT_ISLOW;jpeg_set_quality(&encoder,quality<1?1:quality,TRUE);jpeg_start_compress(&encoder,TRUE);return 1;
}
int gray_stream_open(unsigned w,unsigned h,int quality){return open_stream(w,h,quality);}
int gray_stream_write(const unsigned char* rgb,unsigned rows){if(!encoder.mem||!rows||rows>32||encoder.next_scanline+rows>height)return 0;if(setjmp(error.jump))return 0;for(unsigned y=0;y<rows;y++){for(unsigned x=0;x<width;x++)gray_row[x]=to_gray(rgb+(y*width+x)*3);JSAMPROW row=gray_row;if(jpeg_write_scanlines(&encoder,&row,1)!=1)return 0;}return 1;}
int gray_stream_end_write(void){if(!encoder.mem||encoder.next_scanline!=height)return 0;if(setjmp(error.jump))return 0;jpeg_finish_compress(&encoder);jpeg_destroy_compress(&encoder);return 1;}
int gray_stream_begin_read(unsigned w,unsigned h){
 failed=0;width=w;height=h;decoder.err=jpeg_std_error(&error.pub);error.pub.error_exit=fail;if(setjmp(error.jump))return 0;jpeg_create_decompress(&decoder);source.init_source=init_input;source.fill_input_buffer=fill_input;source.skip_input_data=skip_input;source.resync_to_restart=jpeg_resync_to_restart;source.term_source=term_input;source.bytes_in_buffer=0;source.next_input_byte=NULL;decoder.src=&source;jpeg_read_header(&decoder,TRUE);
 if(decoder.image_width!=w||decoder.image_height!=h)return 0;decoder.out_color_space=JCS_GRAYSCALE;decoder.dct_method=JDCT_ISLOW;jpeg_start_decompress(&decoder);return 1;
}
double gray_stream_read_loss(const unsigned char* rgb,unsigned rows){
 if(!decoder.mem||!rows||rows>32||decoder.output_scanline+rows>height)return -1;if(setjmp(error.jump))return -1;
 double sum=0;for(unsigned y=0;y<rows;y++){JSAMPROW row=gray_row;if(jpeg_read_scanlines(&decoder,&row,1)!=1)return -1;for(unsigned x=0;x<width;x++){int d=(int)to_gray(rgb+(y*width+x)*3)-(int)gray_row[x];sum+=d<0?-d:d;}}return sum;
}
int gray_stream_end_read(void){if(!decoder.mem||decoder.output_scanline!=height)return 0;if(setjmp(error.jump))return 0;jpeg_finish_decompress(&decoder);jpeg_destroy_decompress(&decoder);return 1;}
int gray_stream_error(void){return failed;}
