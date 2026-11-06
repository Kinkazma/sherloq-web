/* Browser bridge using the same libjpeg API defaults as OpenCV imencode.
 * Sources: libjpeg-turbo 3.0.3, IJG API. No SIMD/fast DCT/trellis substitution. */
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
int jpeg_decode(const unsigned char* bytes, unsigned long length, unsigned char* out, int width, int height) {
 struct jpeg_decompress_struct c={0}; struct guarded_error e;
 c.err=jpeg_std_error(&e.pub);e.pub.error_exit=fail;
 if(setjmp(e.jump)){jpeg_destroy_decompress(&c);return 0;}
 jpeg_create_decompress(&c);jpeg_mem_src(&c,bytes,length);
 jpeg_read_header(&c,TRUE);c.out_color_space=JCS_RGB;c.dct_method=JDCT_ISLOW;
 if(c.image_width!=(unsigned)width||c.image_height!=(unsigned)height){jpeg_destroy_decompress(&c);return 0;}
 jpeg_start_decompress(&c);
 while(c.output_scanline<c.output_height){JSAMPROW row=out+(size_t)c.output_scanline*width*3;jpeg_read_scanlines(&c,&row,1);}
 jpeg_finish_decompress(&c);jpeg_destroy_decompress(&c);return 1;
}
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
 jpeg_read_header(&s->decoder,TRUE);s->decoder.out_color_space=JCS_RGB;s->decoder.dct_method=JDCT_ISLOW;
 if(width<=0||height<=0||s->decoder.image_width!=(unsigned)width||s->decoder.image_height!=(unsigned)height){jpeg_destroy_decompress(&s->decoder);free(s);jpeg_rows_last_error=1;return NULL;}
 jpeg_start_decompress(&s->decoder);return s;
}
int jpeg_rows_read(struct jpeg_rows_state* s,unsigned char* out,int maximum_rows){
 if(!s||s->failed||maximum_rows<=0)return -1;
 if(setjmp(s->error.jump)){jpeg_rows_record_error(s);return -1;}
 int rows=0;while(rows<maximum_rows&&s->decoder.output_scanline<s->decoder.output_height){
  JSAMPROW row=out+(size_t)rows*s->decoder.output_width*3;
  if(jpeg_read_scanlines(&s->decoder,&row,1)!=1){s->failed=jpeg_rows_last_error=1;return -1;}rows++;
 }return rows;
}
int jpeg_rows_finish(struct jpeg_rows_state* s){
 if(!s||s->failed||s->decoder.output_scanline!=s->decoder.output_height)return 0;
 if(setjmp(s->error.jump)){jpeg_rows_record_error(s);return 0;}
 return jpeg_finish_decompress(&s->decoder)?1:0;
}
void jpeg_rows_close(struct jpeg_rows_state* s){if(s){if(s->created)jpeg_destroy_decompress(&s->decoder);free(s);}}
static int jpeg_recompress_sampling(const unsigned char* in, unsigned char* out, int width, int height, int quality,int sampling444) {
 struct jpeg_compress_struct c={0};struct guarded_error e;struct encoded_buffer {unsigned char* data;unsigned long size;};
 struct encoded_buffer* encoded=calloc(1,sizeof(struct encoded_buffer));
 if(!encoded)return 0;
 if(width<=0||height<=0||quality<1||quality>100){free(encoded);return 0;}
 c.err=jpeg_std_error(&e.pub);e.pub.error_exit=fail;
 if(setjmp(e.jump)){jpeg_destroy_compress(&c);free(encoded->data);free(encoded);return 0;}
 jpeg_create_compress(&c);jpeg_mem_dest(&c,&encoded->data,&encoded->size);
 c.image_width=width;c.image_height=height;c.input_components=3;c.in_color_space=JCS_RGB;
 jpeg_set_defaults(&c);c.dct_method=JDCT_ISLOW;jpeg_set_quality(&c,quality,TRUE);
 if(sampling444)for(int i=0;i<3;i++)c.comp_info[i].h_samp_factor=c.comp_info[i].v_samp_factor=1;
 jpeg_start_compress(&c,TRUE);
 while(c.next_scanline<c.image_height){JSAMPROW row=(JSAMPROW)(in+(size_t)c.next_scanline*width*3);jpeg_write_scanlines(&c,&row,1);}
 jpeg_finish_compress(&c);jpeg_destroy_compress(&c);
 int ok=jpeg_decode(encoded->data,encoded->size,out,width,height);free(encoded->data);free(encoded);return ok;
}
int jpeg_recompress(const unsigned char* in,unsigned char* out,int width,int height,int quality){return jpeg_recompress_sampling(in,out,width,height,quality,0);}
int jpeg_recompress_444(const unsigned char* in,unsigned char* out,int width,int height,int quality){return jpeg_recompress_sampling(in,out,width,height,quality,1);}
int jpeg_recompress_gray(const unsigned char* in,unsigned char* out,int width,int height,int quality){
 struct jpeg_compress_struct c={0};struct jpeg_decompress_struct d={0};struct guarded_error e,ed;
 struct encoded_gray {unsigned char* data;unsigned long size;};struct encoded_gray* encoded=calloc(1,sizeof(struct encoded_gray));if(!encoded)return 0;
 if(width<=0||height<=0||quality<1||quality>100){free(encoded);return 0;}
 c.err=jpeg_std_error(&e.pub);e.pub.error_exit=fail;
 if(setjmp(e.jump)){jpeg_destroy_compress(&c);free(encoded->data);free(encoded);return 0;}
 jpeg_create_compress(&c);jpeg_mem_dest(&c,&encoded->data,&encoded->size);c.image_width=width;c.image_height=height;c.input_components=1;c.in_color_space=JCS_GRAYSCALE;
 jpeg_set_defaults(&c);c.dct_method=JDCT_ISLOW;jpeg_set_quality(&c,quality,TRUE);jpeg_start_compress(&c,TRUE);
 while(c.next_scanline<c.image_height){JSAMPROW row=(JSAMPROW)(in+(size_t)c.next_scanline*width);jpeg_write_scanlines(&c,&row,1);}jpeg_finish_compress(&c);jpeg_destroy_compress(&c);
 d.err=jpeg_std_error(&ed.pub);ed.pub.error_exit=fail;if(setjmp(ed.jump)){jpeg_destroy_decompress(&d);free(encoded->data);free(encoded);return 0;}
 jpeg_create_decompress(&d);jpeg_mem_src(&d,encoded->data,encoded->size);jpeg_read_header(&d,TRUE);d.out_color_space=JCS_GRAYSCALE;d.dct_method=JDCT_ISLOW;jpeg_start_decompress(&d);
 while(d.output_scanline<d.output_height){JSAMPROW row=out+(size_t)d.output_scanline*width;jpeg_read_scanlines(&d,&row,1);}jpeg_finish_decompress(&d);jpeg_destroy_decompress(&d);free(encoded->data);free(encoded);return 1;
}

/* Exact stored quantized coefficients. Never estimate a DCT from decoded pixels.
 * Layout: source width/height, complete blocks, progressive flag, then nine
 * records of quantization step, ignored >=256 tail and 256 histogram counts. */
int jpeg_dct_histograms(const unsigned char* bytes,unsigned long length,uint32_t* out,int width,int height){
 static const int frequencies[9]={1,8,9,2,16,10,17,3,24};
 struct jpeg_decompress_struct c={0};struct guarded_error e;
 c.err=jpeg_std_error(&e.pub);e.pub.error_exit=fail;
 if(setjmp(e.jump)){jpeg_destroy_decompress(&c);return 0;}
 jpeg_create_decompress(&c);jpeg_mem_src(&c,bytes,length);jpeg_read_header(&c,TRUE);
 if(c.image_width!=(unsigned)width||c.image_height!=(unsigned)height||c.data_precision!=8||(c.num_components!=1&&c.num_components!=3)){jpeg_destroy_decompress(&c);return 0;}
 jvirt_barray_ptr* arrays=jpeg_read_coefficients(&c);if(!arrays){jpeg_destroy_decompress(&c);return 0;}
 jpeg_component_info* component=&c.comp_info[0];JQUANT_TBL* table=c.quant_tbl_ptrs[component->quant_tbl_no];if(!table){jpeg_destroy_decompress(&c);return 0;}
 JDIMENSION rows=height/8,columns=width/8;if(rows>component->height_in_blocks)rows=component->height_in_blocks;if(columns>component->width_in_blocks)columns=component->width_in_blocks;
 memset(out,0,(4+9*258)*sizeof(uint32_t));out[0]=width;out[1]=height;out[2]=rows*columns;out[3]=c.progressive_mode;
 for(int f=0;f<9;f++)out[4+f*258]=table->quantval[frequencies[f]];
 for(JDIMENSION y=0;y<rows;y++){
  JBLOCKARRAY row=(*c.mem->access_virt_barray)((j_common_ptr)&c,arrays[0],y,1,FALSE);
  for(JDIMENSION x=0;x<columns;x++)for(int f=0;f<9;f++){
   int value=row[0][x][frequencies[f]];if(value<0)value=-value;uint32_t* record=out+4+f*258;
   if(value>=256)record[1]++;else record[2+value]++;
  }
 }
 jpeg_finish_decompress(&c);int ok=e.pub.num_warnings==0;jpeg_destroy_decompress(&c);return ok;
}
void jpeg_gaussian_histogram(const uint32_t* input,const double* weights,int radius,double* output){
 for(int x=0;x<256;x++){
  double value=input[x]*weights[radius];
  for(int k=radius;k>0;k--){int left=x-k,right=x+k;if(left<0)left=-left-1;if(right>=256)right=511-right;double pair=(double)input[left]+(double)input[right];
   /* Pinned SciPy's vectorized prefix multiplies eight pairs separately;
    * the remaining scalar pairs use FMA. Preserve both rounding boundaries. */
   if(radius-k<radius/8*8){double product=pair*weights[radius-k];value+=product;}else value=fma(pair,weights[radius-k],value);
  }
  output[x]=value;
 }
}
