/* Native original-file grayscale, libjpeg ISLOW scanlines. */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <setjmp.h>
#include <string.h>
#include <math.h>
#include <jpeglib.h>
#include <jerror.h>
struct guarded_error { struct jpeg_error_mgr pub; jmp_buf jump; };
static void fail(j_common_ptr c) { longjmp(((struct guarded_error*)c->err)->jump,1); }
/* The same decoder/defaults, exposing scanlines without allocating a full RGB
 * destination. Encoded bytes must remain live until close. Progressive JPEG
 * coefficient arrays still belong to libjpeg and retain their real WASM limit. */
struct jpeg_rows_state {
 struct jpeg_decompress_struct decoder;
 struct guarded_error error;
 int created,failed;
};
static int jpeg_rows_last_error=0;
static void jpeg_rows_record_error(struct jpeg_rows_state* s){
 s->failed=s->error.pub.msg_code==JERR_OUT_OF_MEMORY?2:1;
 jpeg_rows_last_error=s->failed;
}
int jpeg_rows_error(void){return jpeg_rows_last_error;}
struct jpeg_rows_state* jpeg_rows_open(const unsigned char* bytes,unsigned long length,int width,int height){
 jpeg_rows_last_error=0;
 struct jpeg_rows_state* s=calloc(1,sizeof(*s));if(!s){jpeg_rows_last_error=2;return NULL;}
 s->decoder.err=jpeg_std_error(&s->error.pub);s->error.pub.error_exit=fail;
 if(setjmp(s->error.jump)){jpeg_rows_record_error(s);if(s->decoder.mem)jpeg_destroy_decompress(&s->decoder);free(s);return NULL;}
 jpeg_create_decompress(&s->decoder);s->created=1;jpeg_mem_src(&s->decoder,bytes,length);
 jpeg_read_header(&s->decoder,TRUE);s->decoder.out_color_space=JCS_GRAYSCALE;s->decoder.dct_method=JDCT_ISLOW;
 if(width<=0||height<=0||s->decoder.image_width!=(unsigned)width||s->decoder.image_height!=(unsigned)height){jpeg_destroy_decompress(&s->decoder);free(s);jpeg_rows_last_error=1;return NULL;}
 jpeg_start_decompress(&s->decoder);return s;
}
int jpeg_rows_read(struct jpeg_rows_state* s,unsigned char* out,int maximum_rows){
 if(!s||s->failed||maximum_rows<=0)return -1;
 if(setjmp(s->error.jump)){jpeg_rows_record_error(s);return -1;}
 int rows=0;while(rows<maximum_rows&&s->decoder.output_scanline<s->decoder.output_height){
  JSAMPROW row=out+(size_t)rows*s->decoder.output_width;
  if(jpeg_read_scanlines(&s->decoder,&row,1)!=1){s->failed=jpeg_rows_last_error=1;return -1;}rows++;
 }return rows;
}
int jpeg_rows_finish(struct jpeg_rows_state* s){
 if(!s||s->failed||s->decoder.output_scanline!=s->decoder.output_height)return 0;
 if(setjmp(s->error.jump)){jpeg_rows_record_error(s);return 0;}
 return jpeg_finish_decompress(&s->decoder)?1:0;
}
void jpeg_rows_close(struct jpeg_rows_state* s){if(s){if(s->created)jpeg_destroy_decompress(&s->decoder);free(s);}}
