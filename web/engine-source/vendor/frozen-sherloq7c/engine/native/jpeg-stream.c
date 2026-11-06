/* Global libjpeg-turbo recompression, fed/drained in complete scanlines.
 * Same grayscale, ISLOW and quality defaults as native OpenCV recompression. */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <setjmp.h>
#include <jpeglib.h>
#include <jerror.h>
struct error {struct jpeg_error_mgr pub;jmp_buf jump;};
struct stream {struct jpeg_compress_struct encoder;struct jpeg_decompress_struct decoder;struct error error;unsigned char *encoded,*gray;unsigned long encoded_size;int width,height,failed,reading;};
static int last_error;
static void fail(j_common_ptr c){longjmp(((struct error*)c->err)->jump,1);}
static void record(struct stream*s){s->failed=last_error=s->error.pub.msg_code==JERR_OUT_OF_MEMORY?2:1;}
void stream_close(struct stream*s){if(s){if(s->encoder.mem)jpeg_destroy_compress(&s->encoder);if(s->decoder.mem)jpeg_destroy_decompress(&s->decoder);free(s->encoded);free(s->gray);free(s);}}
int stream_error(void){return last_error;}
struct stream* stream_open(int width,int height,int quality){
 last_error=0;if(width<1||height<1||width>JPEG_MAX_DIMENSION||height>JPEG_MAX_DIMENSION||quality<0||quality>100){last_error=1;return NULL;}
 struct stream*s=calloc(1,sizeof(*s));if(!s){last_error=2;return NULL;}s->width=width;s->height=height;s->gray=malloc(width);if(!s->gray){stream_close(s);last_error=2;return NULL;}
 s->encoder.err=jpeg_std_error(&s->error.pub);s->error.pub.error_exit=fail;
 if(setjmp(s->error.jump)){record(s);stream_close(s);return NULL;}
 jpeg_create_compress(&s->encoder);jpeg_mem_dest(&s->encoder,&s->encoded,&s->encoded_size);
 s->encoder.image_width=width;s->encoder.image_height=height;s->encoder.input_components=1;s->encoder.in_color_space=JCS_GRAYSCALE;
 jpeg_set_defaults(&s->encoder);s->encoder.dct_method=JDCT_ISLOW;jpeg_set_quality(&s->encoder,quality<1?1:quality,TRUE);jpeg_start_compress(&s->encoder,TRUE);return s;
}
static unsigned char gray(const unsigned char*p){return (p[0]*9798+p[1]*19235+p[2]*3735+16384)>>15;}
int stream_write(struct stream*s,const unsigned char*rgb,int rows){
 if(!s||s->failed||s->reading||rows<1||rows>s->height-(int)s->encoder.next_scanline)return 0;
 if(setjmp(s->error.jump)){record(s);return 0;}
 for(int y=0;y<rows;y++){const unsigned char*src=rgb+(size_t)y*s->width*3;for(int x=0;x<s->width;x++)s->gray[x]=gray(src+x*3);JSAMPROW row=s->gray;if(jpeg_write_scanlines(&s->encoder,&row,1)!=1)return 0;}return 1;
}
int stream_begin_read(struct stream*s){
 if(!s||s->failed||s->reading||s->encoder.next_scanline!=(unsigned)s->height)return 0;
 if(setjmp(s->error.jump)){record(s);return 0;}
 jpeg_finish_compress(&s->encoder);jpeg_destroy_compress(&s->encoder);
 s->decoder.err=jpeg_std_error(&s->error.pub);s->error.pub.error_exit=fail;jpeg_create_decompress(&s->decoder);jpeg_mem_src(&s->decoder,s->encoded,s->encoded_size);jpeg_read_header(&s->decoder,TRUE);s->decoder.out_color_space=JCS_GRAYSCALE;s->decoder.dct_method=JDCT_ISLOW;jpeg_start_decompress(&s->decoder);s->reading=1;return 1;
}
double stream_read_loss(struct stream*s,const unsigned char*rgb,int rows){
 if(!s||s->failed||!s->reading||rows<1||rows>s->height-(int)s->decoder.output_scanline)return -1;
 if(setjmp(s->error.jump)){record(s);return -1;}
 uint64_t sum=0;for(int y=0;y<rows;y++){JSAMPROW row=s->gray;if(jpeg_read_scanlines(&s->decoder,&row,1)!=1)return -1;const unsigned char*src=rgb+(size_t)y*s->width*3;for(int x=0;x<s->width;x++){int difference=(int)gray(src+x*3)-(int)s->gray[x];sum+=difference<0?-difference:difference;}}
 if(s->decoder.output_scanline==(unsigned)s->height)jpeg_finish_decompress(&s->decoder);
 return (double)sum;
}
