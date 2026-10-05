/* Stored JPEG coefficients and original RGB pixels for CAT-Net v2.
 * libjpeg-turbo is linked unchanged. No DCT is estimated from decoded RGB. */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <setjmp.h>
#include <jpeglib.h>
struct error_state {struct jpeg_error_mgr pub;jmp_buf jump;};
static void fail(j_common_ptr c){longjmp(((struct error_state*)c->err)->jump,1);}
int catnet_coeff(const uint8_t* bytes,unsigned long length,int16_t* out,float* table,int width,int height){
 struct jpeg_decompress_struct c={0};struct error_state e;c.err=jpeg_std_error(&e.pub);e.pub.error_exit=fail;
 if(setjmp(e.jump)){jpeg_destroy_decompress(&c);return 0;}
 jpeg_create_decompress(&c);jpeg_mem_src(&c,bytes,length);jpeg_read_header(&c,TRUE);
 if(c.image_width!=(unsigned)width||c.image_height!=(unsigned)height||c.data_precision!=8||(c.num_components!=1&&c.num_components!=3)){jpeg_destroy_decompress(&c);return 0;}
 jvirt_barray_ptr* arrays=jpeg_read_coefficients(&c);jpeg_component_info* component=&c.comp_info[0];JQUANT_TBL* q=c.quant_tbl_ptrs[component->quant_tbl_no];
 unsigned rows=(height+7)/8,cols=(width+7)/8;
 if(!arrays||!q||rows>component->height_in_blocks||cols>component->width_in_blocks){jpeg_destroy_decompress(&c);return 0;}
 for(int i=0;i<64;i++)table[i]=q->quantval[i];
 for(unsigned y=0;y<rows;y++){
  JBLOCKARRAY row=(*c.mem->access_virt_barray)((j_common_ptr)&c,arrays[0],y,1,FALSE);
  for(unsigned x=0;x<cols;x++)for(int dy=0;dy<8;dy++)for(int dx=0;dx<8;dx++)out[(y*8+dy)*(cols*8)+x*8+dx]=row[0][x][dy*8+dx];
 }
 jpeg_finish_decompress(&c);int ok=e.pub.num_warnings==0;jpeg_destroy_decompress(&c);return ok;
}
int catnet_decode(const uint8_t* bytes,unsigned long length,uint8_t* out,int width,int height){
 struct jpeg_decompress_struct c={0};struct error_state e;c.err=jpeg_std_error(&e.pub);e.pub.error_exit=fail;
 if(setjmp(e.jump)){jpeg_destroy_decompress(&c);return 0;}
 jpeg_create_decompress(&c);jpeg_mem_src(&c,bytes,length);jpeg_read_header(&c,TRUE);c.out_color_space=JCS_RGB;c.dct_method=JDCT_ISLOW;
 if(c.image_width!=(unsigned)width||c.image_height!=(unsigned)height||c.data_precision!=8||(c.num_components!=1&&c.num_components!=3)){jpeg_destroy_decompress(&c);return 0;}
 jpeg_start_decompress(&c);while(c.output_scanline<c.output_height){JSAMPROW row=out+(size_t)c.output_scanline*width*3;jpeg_read_scanlines(&c,&row,1);}jpeg_finish_decompress(&c);int ok=e.pub.num_warnings==0;jpeg_destroy_decompress(&c);return ok;
}
int catnet_companion(const uint8_t* rgb,int width,int height,uint8_t* out,unsigned long capacity){
 struct jpeg_compress_struct c={0};struct error_state e;c.err=jpeg_std_error(&e.pub);e.pub.error_exit=fail;
 unsigned char* volatile encoded=NULL;unsigned long length=0;
 if(setjmp(e.jump)){jpeg_destroy_compress(&c);free((void*)encoded);return -1;}
 jpeg_create_compress(&c);jpeg_mem_dest(&c,(unsigned char**)&encoded,&length);c.image_width=width;c.image_height=height;c.input_components=3;c.in_color_space=JCS_RGB;
 jpeg_set_defaults(&c);jpeg_set_quality(&c,100,TRUE);c.dct_method=JDCT_ISLOW;
 for(int i=0;i<3;i++){c.comp_info[i].h_samp_factor=1;c.comp_info[i].v_samp_factor=1;}
 jpeg_start_compress(&c,TRUE);while(c.next_scanline<c.image_height){JSAMPROW row=(JSAMPROW)(rgb+(size_t)c.next_scanline*width*3);jpeg_write_scanlines(&c,&row,1);}jpeg_finish_compress(&c);jpeg_destroy_compress(&c);
 if(length>capacity||length>INT32_MAX){free((void*)encoded);return -1;}
 memcpy(out,(void*)encoded,length);free((void*)encoded);return (int)length;
}

/* Retain libjpeg's actual coefficient arrays; return bounded category rows.
 * The caller keeps the original encoded bytes alive until close. */
struct catnet_coeff_reader {struct jpeg_decompress_struct c;struct error_state e;jvirt_barray_ptr* arrays;unsigned rows,cols;};
uintptr_t catnet_coeff_open(const uint8_t* bytes,unsigned long length,float* table,int width,int height){
 struct catnet_coeff_reader* r=calloc(1,sizeof(*r));if(!r)return 0;r->c.err=jpeg_std_error(&r->e.pub);r->e.pub.error_exit=fail;
 if(setjmp(r->e.jump)){jpeg_destroy_decompress(&r->c);free(r);return 0;}
 jpeg_create_decompress(&r->c);jpeg_mem_src(&r->c,bytes,length);jpeg_read_header(&r->c,TRUE);
 if(r->c.image_width!=(unsigned)width||r->c.image_height!=(unsigned)height||r->c.data_precision!=8||(r->c.num_components!=1&&r->c.num_components!=3)){jpeg_destroy_decompress(&r->c);free(r);return 0;}
 r->arrays=jpeg_read_coefficients(&r->c);jpeg_component_info* component=&r->c.comp_info[0];JQUANT_TBL* q=r->c.quant_tbl_ptrs[component->quant_tbl_no];r->rows=(height+7)/8;r->cols=(width+7)/8;
 if(!r->arrays||!q||r->rows>component->height_in_blocks||r->cols>component->width_in_blocks||r->e.pub.num_warnings){jpeg_destroy_decompress(&r->c);free(r);return 0;}
 for(int i=0;i<64;i++)table[i]=q->quantval[i];return (uintptr_t)r;
}
int catnet_coeff_rows(uintptr_t handle,int top,int rows,uint8_t* out){
 struct catnet_coeff_reader* r=(struct catnet_coeff_reader*)handle;
 if(!r||top<0||rows<=0||top%8||rows%8||(unsigned)(top+rows)>r->rows*8)return 0;
 if(setjmp(r->e.jump))return 0;
 for(unsigned y=top/8;y<(unsigned)(top+rows)/8;y++){
  JBLOCKARRAY row=(*r->c.mem->access_virt_barray)((j_common_ptr)&r->c,r->arrays[0],y,1,FALSE);
  for(unsigned x=0;x<r->cols;x++)for(int dy=0;dy<8;dy++)for(int dx=0;dx<8;dx++){
   int v=row[0][x][dy*8+dx];v=v<0?-v:v;out[((y*8-top)+dy)*(r->cols*8)+x*8+dx]=v>20?20:v;
  }
 }return r->e.pub.num_warnings==0;
}
int catnet_coeff_close(uintptr_t handle){
 struct catnet_coeff_reader* r=(struct catnet_coeff_reader*)handle;if(!r)return 0;int ok=0;
 if(!setjmp(r->e.jump)){jpeg_finish_decompress(&r->c);ok=r->e.pub.num_warnings==0;}
 jpeg_destroy_decompress(&r->c);free(r);return ok;
}
