/* Native baseline420 entropy from the exact ISLOW quantized coefficients.
   Destination is externally bounded; GPU does not approximate JPEG evidence. */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <setjmp.h>
#include <jpeglib.h>
#include <jerror.h>
#include <emscripten.h>
#define IO_SIZE 65536
#define MAX_COEFFICIENT_BYTES (24u*1024u*1024u)
static struct jpeg_compress_struct encoder;
static struct {struct jpeg_error_mgr pub;jmp_buf jump;} error;
static struct jpeg_destination_mgr destination;
static JOCTET output[IO_SIZE];static int failed;
EM_ASYNC_JS(int, coeff_write_encoded, (const unsigned char* bytes,unsigned length), {
 try{await Module['writeEncoded'](bytes,length);return 1;}
 catch(error){Module['ioFailed']=true;Module['ioFailure']=error;return 0;}
});
static void fail(j_common_ptr c){failed=c->err->msg_code==JERR_OUT_OF_MEMORY?2:1;longjmp(error.jump,1);}
static void init_output(j_compress_ptr c){c->dest->next_output_byte=output;c->dest->free_in_buffer=IO_SIZE;}
static boolean empty_output(j_compress_ptr c){if(!coeff_write_encoded(output,IO_SIZE))ERREXIT(c,JERR_FILE_WRITE);init_output(c);return TRUE;}
static void term_output(j_compress_ptr c){unsigned length=IO_SIZE-c->dest->free_in_buffer;if(length&&!coeff_write_encoded(output,length))ERREXIT(c,JERR_FILE_WRITE);}
void jpeg_coeff_close(void){if(encoder.mem)jpeg_destroy_compress(&encoder);}
int jpeg_coeff_error(void){return failed;}
int jpeg_coeff_encode(const int16_t* input,unsigned width,unsigned height,int quality){
 jpeg_coeff_close();failed=0;
 if(!input||!width||!height||width>JPEG_MAX_DIMENSION||height>JPEG_MAX_DIMENSION||quality<1||quality>100)return 0;
 uint64_t blocks=(uint64_t)((width+7)/8)*((height+7)/8)+2ull*((width+15)/16)*((height+15)/16);
 if(blocks*64u*sizeof(int16_t)>MAX_COEFFICIENT_BYTES){failed=2;return 0;}
 memset(&encoder,0,sizeof(encoder));encoder.err=jpeg_std_error(&error.pub);error.pub.error_exit=fail;if(setjmp(error.jump)){jpeg_coeff_close();return 0;}
 jpeg_create_compress(&encoder);destination.init_destination=init_output;destination.empty_output_buffer=empty_output;destination.term_destination=term_output;encoder.dest=&destination;
 encoder.image_width=width;encoder.image_height=height;encoder.input_components=3;encoder.in_color_space=JCS_RGB;jpeg_set_defaults(&encoder);encoder.dct_method=JDCT_ISLOW;jpeg_set_quality(&encoder,quality,TRUE);
 jvirt_barray_ptr arrays[3];unsigned cols[3]={(width+7)/8,(width+15)/16,(width+15)/16},rows[3]={(height+7)/8,(height+15)/16,(height+15)/16};size_t offset=0;
 for(int c=0;c<3;c++){unsigned access=c?1:2,rounded=(rows[c]+access-1)/access*access;arrays[c]=encoder.mem->request_virt_barray((j_common_ptr)&encoder,JPOOL_IMAGE,TRUE,cols[c],rounded,access);}
 encoder.mem->realize_virt_arrays((j_common_ptr)&encoder);
 for(int c=0;c<3;c++)for(unsigned y=0;y<rows[c];y++){JBLOCKARRAY row=encoder.mem->access_virt_barray((j_common_ptr)&encoder,arrays[c],y,1,TRUE);memcpy(row[0],input+offset,cols[c]*64*sizeof(int16_t));offset+=cols[c]*64;}
 jpeg_write_coefficients(&encoder,arrays);jpeg_finish_compress(&encoder);jpeg_coeff_close();return 1;
}
